import { readNativeTextFilterFacts } from '../../../nativeTextFilterFacts.mjs';
import { NATIVE_TEXT_DEFAULTS, NATIVE_VALUE_KEYS, TEXT_LEDGER_BYTES, checkNativeTextConfig, nativeTextAllowed, isTextRecord, newTextLedger, textOperation } from './nativeText.mjs';
import { paidAmountVisible, mergePaidAmounts } from '../../paidFilter.mjs';
/** Bounded original-callback runtime. No transport, room connection, or native BB transforms. */
export const DEFAULT_CONFIG = Object.freeze({
  minGiftPrice: 0.1, showDanmaku: true, showGift: true, showGiftName: false,
  mergeSimilarDanmaku: false, mergeGift: true, maxNumber: 60,
  blockGiftDanmaku: true, blockMirrorMessages: false, blockLevel: 0,
  blockNewbie: false, blockNotMobileVerified: false, blockMedalLevel: 0,
  showDebugMessages: false, importPresetCss: false, templateUrl: '',
});
export const DEFAULT_HOST_POLICY = Object.freeze({ hostPaidFilter: false, hostPaidThreshold: 0.1, hostPaidMode: 'unit', hostEventFilter: false, hostShowSuperChat: true, hostShowGuard: true, hostShowFreeGift: true, hostShowNormalGift: true });
const ENGINE_DEFAULTS = Object.freeze({ ...DEFAULT_CONFIG, ...DEFAULT_HOST_POLICY, ...NATIVE_TEXT_DEFAULTS });
export const RETENTION = Object.freeze({ maxCallbacks: 10000, maxRecords: 5000,
  maxBytes: 16 * 1024 * 1024, maxLiveRecords: 10000, maxLiveBytes: 32 * 1024 * 1024, ttlMs: 2 * 60 * 60 * 1000, maxTombstones: 20000, maxTombstoneBytes: 2 * 1024 * 1024 });
const METHODS = new Set(['onAddText', 'onAddGift', 'onAddMember', 'onAddSuperChat',
  'onDelSuperChat', 'onUpdateTranslation', 'onDebugMsg']);
const clone = value => JSON.parse(JSON.stringify(value));
const number = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = value => typeof value === 'string' ? value : '';
const types = { onAddText: 0, onAddGift: 1, onAddMember: 2, onAddSuperChat: 3, onDebugMsg: 0 };
const PIN_TIERS = [[700, 60], [350, 30], [140, 10], [70, 5], [35, 2]];
export function pinDurationMs(message) {
  if (message.type === 2) return 120000;
  if (message.type === 0) return 0;
  return (PIN_TIERS.find(([price]) => message.price >= price)?.[1] || 0) * 60000;
}
export function isPinned(message, now) { return now - +new Date(message.addTime) < pinDurationMs(message); }

/** Uses original Home parsing for legal typed values. The UI owns input parsing/errors. */
function validateConfig(patch, previous, defaults) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象');
  checkNativeTextConfig(patch);
  for (const key of ['hostEventFilter', 'hostShowSuperChat', 'hostShowGuard']) {
    if (!(key in patch)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(patch, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(`设置字段无效：${key}`);
  }
  // Project previous too: an engine config must never leak host policy into the public schema.
  const out = Object.fromEntries(Object.keys(defaults).map(key => [key, Object.hasOwn(previous, key) ? previous[key] : defaults[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults, key)) { if (key === 'lang') continue; throw new Error(`不支持的设置：${key}`); }
    if (typeof value !== typeof defaults[key]) throw new Error(`设置类型无效：${key}`);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < (key === 'maxNumber' ? 1 : 0))) throw new Error(`设置数值无效：${key}`);
    if (['maxNumber', 'blockLevel', 'blockMedalLevel'].includes(key) && !Number.isSafeInteger(value)) throw new Error(`设置必须是整数：${key}`);
    if (key === 'blockLevel' && value > 60 || key === 'blockMedalLevel' && value > 120) throw new Error(`设置超出范围：${key}`);
    if (key === 'templateUrl' && value !== '') {
      let parsed; try { parsed = new URL(value); } catch { throw new Error('模板地址必须是完整的 HTTP(S) 地址'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('模板地址必须是无账号密码的 HTTP(S) 地址');
    }
    if (key === 'hostPaidMode' && !['unit', 'cumulative'].includes(value)) throw new Error('Invalid paid amount mode');
    out[key] = value;
  }
  return out;
}

export function checkConfig(patch, previous = DEFAULT_CONFIG) { return validateConfig(patch, previous, DEFAULT_CONFIG); }
function checkEngineConfig(patch, previous = ENGINE_DEFAULTS) { return validateConfig(patch, previous, ENGINE_DEFAULTS); }
function mergePaidMetadata(first, next) {
  if (Object.hasOwn(first, 'bbPaidAmount') || Object.hasOwn(next, 'bbPaidAmount'))
    first.bbPaidAmount = mergePaidAmounts(first.bbPaidAmount, next.bbPaidAmount);
}

export class BlivechatRuntime {
  constructor({ config = {}, sink = {}, now = () => Date.now(), retention = {}, translate = () => '新会员', resolveParts } = {}) {
    this.config = checkEngineConfig(config); this.sink = sink; this.now = now;
    this.retention = { ...RETENTION, ...retention }; this.translate = translate; this.resolveParts = resolveParts;
    this.reset(false);
  }
  reset(notify = true) {
    this.records = new Map(); this.recordBytes = 0; this.liveRecords = new Map(); this.liveBytes = 0; this.journal = []; this.journalBytes = 0; this.pending = new Set(); this.projectionVersion = (this.projectionVersion || 0) + 1;
    this.tombstones = new Set(); this.tombstoneBytes = 0; this.tombstoneOverflow = false; this.sequence = 0;
    this.projected = []; this.projectedById = new Map(); this.droppedCallbacks = 0; this.droppedRecords = 0;
    this.deliverySequence = 0; this.inputSequence = 0; this.session = (this.session || 0) + 1;
    if (notify) this.sink.replace?.([], []);
  }
  setConfig(patch) {
    const previous = this.config, next = checkEngineConfig(patch, previous);
    const changed = Object.keys(next).filter(key => next[key] !== previous[key]);
    if (changed.length > 0 && changed.every(key => key === 'showGiftName')) {
      this.config = next;
      return this.snapshot();
    }
    const privateKeys = ['hostShowSuperChat', 'hostShowGuard', ...NATIVE_VALUE_KEYS];
    if (previous.hostEventFilter === next.hostEventFilter && previous.hostNativeTextFilter === next.hostNativeTextFilter &&
        (changed.length > 0 && changed.every(key => privateKeys.includes(key))
          || changed.length === 0 && (next.hostEventFilter || next.hostNativeTextFilter))) {
      if (!changed.length) return this.snapshot();
      const textPlan = next.hostNativeTextFilter ? this.planText(next) : null;
      // Both lanes are prepared against the candidate before config or records change.
      const lanePlan = this.sink.planPrivateReconcile?.(previous, next, textPlan);
      this.config = next;
      if (textPlan) this.commitText(textPlan);
      if (lanePlan) this.sink.applyPrivateReconcile(lanePlan);
      else if (next.hostEventFilter) this.sink.reconcileCategories?.(previous, next);
      this.startUnpreparedText();
      return this.snapshot();
    }
    // Reserve ledger bytes before capability activation mutates the runtime.
    if (next.hostNativeTextFilter && !previous.hostNativeTextFilter) this.ensureTextLedgers(true);
    if (!next.hostNativeTextFilter && previous.hostNativeTextFilter) for (const record of this.allRecords()) {
      if (!record.text) continue;
      record.bytes -= TEXT_LEDGER_BYTES;
      if (this.liveRecords.has(record.id)) this.liveBytes -= TEXT_LEDGER_BYTES; else this.recordBytes -= TEXT_LEDGER_BYTES;
      delete record.text;
    }
    this.config = next;
    if (next.hostNativeTextFilter) this.ensureTextLedgers(false);
    return this.rebuild();
  }
  setSink(sink) { this.sink = sink; return this.rebuild(); }
  markPresented(id, at) {
    const record = this.getRecord(id);
    if (record && record.firstPresentedAt === undefined) {
      record.firstPresentedAt = at;
      const projected = this.projectedById.get(id);
      if (projected) projected.addTime = new Date(at);
    }
  }
  receive(event) {
    if (!event || !METHODS.has(event.method)) throw new Error('未知 blivechat 回调');
    const source = event.payload ?? event.data;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('回调数据必须是对象');
    if(event.method==='onAddGift'&&source.blindGiftName)return this.stats();
    const at = number(event.receivedAt, this.now());
    const facts = readNativeTextFilterFacts(event);
    const carrier = facts === undefined ? {} : { source: { nativeTextFilterFacts: facts } };
    const payload = clone(source);
    const serialized = JSON.stringify({ method: event.method, payload, receivedAt: at, ...carrier });
    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > this.retention.maxBytes) throw new Error('单条消息超过预览保留上限');
    const ledgerBytes = this.config.hostNativeTextFilter && isTextRecord(event) ? TEXT_LEDGER_BYTES : 0;
    if (ledgerBytes && bytes + ledgerBytes > this.retention.maxBytes) throw new Error('单条文本成员超过预览保留上限');
    if (ledgerBytes) this.ensureRetentionRoom(bytes + ledgerBytes, at);
    this.prune(at);
    if (event.method.startsWith('onAdd') || this.config.hostNativeTextFilter && event.method === 'onDebugMsg') this.ensureRetentionRoom(bytes + (this.config.hostNativeTextFilter && isTextRecord(event) ? TEXT_LEDGER_BYTES : 0), at);
    this.journal.push({ method: event.method, payload, receivedAt: at, bytes, ...carrier }); this.journalBytes += bytes;
    this.prune(at);
    if (event.method === 'onDelSuperChat') {
      const ids = Array.isArray(payload.ids) ? payload.ids.filter(id => typeof id === 'string') : [];
      for (const id of ids) {
        if (this.tombstones.has(id)) continue;
        const idBytes = new TextEncoder().encode(id).byteLength;
        if (this.tombstones.size < this.retention.maxTombstones && this.tombstoneBytes + idBytes <= this.retention.maxTombstoneBytes) { this.tombstones.add(id); this.tombstoneBytes += idBytes; }
        else this.tombstoneOverflow = true;
      }
      // Never allow configuration, a duplicate, or a late translation to resurrect deleted SC.
      const removeIds = this.tombstoneOverflow ? this.projected.filter(m => m.type === 3).map(m => m.id) : ids;
      this.projected = this.projected.filter(m => !removeIds.includes(m.id));
      for (const id of removeIds) this.projectedById.delete(id);
      this.sink.delMessages?.(removeIds);
    } else if (event.method === 'onUpdateTranslation') {
      const record = this.getRecord(payload.id);
      let translationRevision;
      if (record) {
        const archive = this.liveRecords.has(record.id);
        const latestTranslation = str(payload.translation);
        translationRevision = (record.translationRevision || 0) + 1;
        const nextBytes = new TextEncoder().encode(JSON.stringify({ payload: record.payload, latestTranslation, translationRevision, ...(record.source ? { source: record.source } : {}) })).byteLength + (record.text ? TEXT_LEDGER_BYTES : 0);
        let retainedCount = this.records.size;
        let retainedBytes = this.recordBytes + (archive ? 0 : nextBytes - record.bytes);
        let reserveCount = this.liveRecords.size;
        let reserveBytes = this.liveBytes + (archive ? nextBytes - record.bytes : 0);
        const liveIds = this.sink.getLiveIds?.();
        for (const candidate of this.records.values()) {
          if (retainedCount <= this.retention.maxRecords && retainedBytes <= this.retention.maxBytes) break;
          const candidateBytes = candidate === record ? nextBytes : candidate.bytes;
          retainedCount--; retainedBytes -= candidateBytes;
          if (this.preserveLive(candidate, at, liveIds)) { reserveCount++; reserveBytes += candidateBytes; }
        }
        if (reserveBytes > this.retention.maxLiveBytes || reserveCount > this.retention.maxLiveRecords)
          throw new Error('翻译更新超过预览保留容量；请等队列消化或重置预览。');
        if (archive) this.liveBytes -= record.bytes; else this.recordBytes -= record.bytes;
        record.latestTranslation = latestTranslation; record.translationRevision = translationRevision; record.bytes = nextBytes;
        if (archive) this.liveBytes += record.bytes; else this.recordBytes += record.bytes;
      }
      const apply = () => {
        // Async part completion must not deliver an update superseded meanwhile.
        if (record && (this.getRecord(payload.id) !== record || record.translationRevision !== translationRevision)) return;
        if (!this.tombstones.has(payload.id) && this.config.hostNativeTextFilter && this.config.templateUrl && record && !this.projectedById.has(payload.id)) {
          this.sink.updateMessage?.(payload.id, { translation: str(payload.translation) });
        }
        if (!this.tombstones.has(payload.id) && this.projectedById.has(payload.id)) {
          this.projectedById.get(payload.id).translation = str(payload.translation);
          this.sink.updateMessage?.(payload.id, { translation: str(payload.translation) });
        }
      };
      if (record?.resolving && record.pendingPromise) {
        const session = this.session;
        const pending = record.pendingPromise.then(() => { if (session === this.session) apply(); }).finally(() => this.pending.delete(pending));
        this.pending.add(pending);
      } else apply();
    } else {
      const id = str(payload.id) || `bb-blivechat-${this.session}-${++this.sequence}`;
      payload.id = id;
      if (!this.getRecord(id) && !(event.method === 'onAddSuperChat' && (this.tombstones.has(id) || this.tombstoneOverflow))) {
        const record = { id, method: event.method, payload: clone(payload), bytes, receivedAt: at, order: ++this.inputSequence, preserveClock: event.replay === true, firstPresentedAt: event.replay === true ? at : undefined, ...carrier };
        if (this.config.hostNativeTextFilter && isTextRecord(record)) { record.text = newTextLedger(record); record.bytes += TEXT_LEDGER_BYTES; }
        if (record.preserveClock) { record.deliveryAt = at; record.deliveryOrder = record.order; }
        this.records.set(id, record); this.recordBytes += record.bytes;
        if (record.text && this.project(record, true, this.config, false) && !nativeTextAllowed(record, this.config)) this.consumeHiddenText(record);
        if (this.resolveParts && types[event.method] === 0) {
          // Original Room filters before asynchronous image-size parsing.
          if (this.project(record)) this.prepareParts(record);
        } else { record.deliveryAt ??= at; record.deliveryOrder ??= ++this.deliverySequence; this.append(record, true); }
      }
    }
    this.prune(at);
    return this.stats();
  }
  prepareParts(record) {
    if (record.resolving || record.contentParts) return;
    record.resolving = true;
    const session = this.session, version = this.projectionVersion;
    const pending = Promise.resolve(this.resolveParts(record.payload)).then(parts => {
      if (session !== this.session || this.getRecord(record.id) !== record || !Array.isArray(parts)) return;
      record.resolving = false; record.contentParts = parts;
      record.deliveryAt ??= this.now(); record.deliveryOrder ??= ++this.deliverySequence;
      if (version === this.projectionVersion) this.append(record, true);
      else this.rebuild(false);
    }).catch(() => { if (session === this.session && this.getRecord(record.id) === record) record.resolving = false; }).finally(() => this.pending.delete(pending));
    record.pendingPromise = pending; this.pending.add(pending);
  }
  ensureRetentionRoom(bytes, at) {
    let count = this.records.size + 1, total = this.recordBytes + bytes;
    let liveCount = this.liveRecords.size, liveBytes = this.liveBytes;
    const liveIds = this.sink.getLiveIds?.();
    for (const record of this.records.values()) {
      if (count <= this.retention.maxRecords && total <= this.retention.maxBytes) break;
      count--; total -= record.bytes;
      if (this.preserveLive(record, at, liveIds)) { liveCount++; liveBytes += record.bytes; }
    }
    if (liveCount > this.retention.maxLiveRecords || liveBytes > this.retention.maxLiveBytes)
      throw new Error('仍在显示或排队的消息达到预览保留上限；请等队列消化或重置预览。');
  }
  getRecord(id) { return this.records.get(id) || this.liveRecords.get(id); }
  preserveLive(record, at, liveIds) {
    const projected = this.projectedById.get(record.id);
    if (record.resolving) return true;
    if (record.text) {
      if (record.text.evicted && !record.text.pending) return false;
      if (record.text.hidden && (record.text.lane || record.text.recoverable) && !record.text.evicted && record.receivedAt >= at - this.retention.ttlMs) return true;
      if (record.text.phase === 'pending-add' || record.text.phase === 'pending-merge') return true;
      if (record.text.group !== null && liveIds) {
        if (liveIds.textGroups) { if (liveIds.textGroups.has(record.text.group)) return true; }
        else for (const id of liveIds) if (this.getRecord(id)?.text?.group === record.text.group) return true;
      }
    }
    if (!record.text && record.mergedInto && record.mergedInto !== record.id) {
      const target = this.getRecord(record.mergedInto);
      if (target && !target.mergedInto && this.preserveLive(target, at, liveIds)) return true;
    }
    return liveIds?.has(record.id) || (liveIds == null && this.sink.addMessage && projected && record.firstPresentedAt === undefined)
      || projected && projected.type !== 0 && isPinned(projected, at);
  }
  prune(at = this.now()) {
    const before = at - this.retention.ttlMs;
    const liveIds = this.sink.getLiveIds?.();
    while (this.journal.length && (this.journal.length > this.retention.maxCallbacks || this.journalBytes > this.retention.maxBytes || this.journal[0].receivedAt < before)) {
      this.journalBytes -= this.journal.shift().bytes; this.droppedCallbacks++;
    }
    const removeProjection = id => {
      this.projectedById.delete(id); this.projected = this.projected.filter(message => message.id !== id);
    };
    for (const [id, record] of this.liveRecords) {
      if (this.preserveLive(record, at, liveIds)) continue;
      this.liveRecords.delete(id); this.liveBytes -= record.bytes; removeProjection(id);
    }
    for (const [id, record] of this.records) {
      if (this.records.size <= this.retention.maxRecords && this.recordBytes <= this.retention.maxBytes && record.receivedAt >= before) break;
      this.records.delete(id); this.recordBytes -= record.bytes; this.droppedRecords++;
      if (this.preserveLive(record, at, liveIds)) {
        this.liveRecords.set(id, record); this.liveBytes += record.bytes;
      } else removeProjection(id);
    }
    // Raw history eviction never clears or fast-forwards the original smoothing queue.
    return false;
  }
  project(record, includeLatestTranslation = true, config = this.config, applyNative = true) {
    if (applyNative && !nativeTextAllowed(record, config)) return null;
    let data = record.payload;
    if (includeLatestTranslation && record.latestTranslation !== undefined) data = { ...data, translation: record.latestTranslation };
    if (record.method === 'onDebugMsg') {
      if (!config.showDebugMessages) return null;
      data = { ...data, authorName: 'blivechat', authorType: 2, authorLevel: 60, medalLevel: 0,
        isMobileVerified: true, timestamp: record.receivedAt / 1000, avatarUrl: '//static.hdslb.com/images/member/noface.gif' };
    }
    const type = types[record.method];
    if (type === 1 && (data.blindGiftName || config[number(data.totalCoin) <= 0 ? 'hostShowFreeGift' : 'hostShowNormalGift'] === false)) return null;
    if (type === 0 && (!config.showDanmaku || config.blockGiftDanmaku && data.isGiftDanmaku
      || config.blockMirrorMessages && data.isMirror || config.blockLevel > 0 && data.authorLevel < config.blockLevel
      || config.blockNewbie && data.isNewbie || !config.hostNativeTextFilter && config.blockNotMobileVerified && !data.isMobileVerified
      || config.blockMedalLevel > 0 && data.medalLevel < config.blockMedalLevel)) return null;
    if (type !== 0 && !config.showGift && (!(config.hostPaidFilter || config.hostEventFilter) || type === 1)) return null;
    if (type === 3 && (this.tombstoneOverflow || this.tombstones.has(data.id))) return null;
    const message = { id: data.id, type, avatarUrl: str(data.avatarUrl), time: new Date(number(data.timestamp, record.receivedAt / 1000) * 1000),
      authorName: str(data.authorName), uid: str(data.uid), privilegeType: number(data.privilegeType),
      medalLevel: number(data.medalLevel), medalName: str(data.medalName),
      addTime: new Date(record.firstPresentedAt ?? record.receivedAt) };
    if (Object.hasOwn(data, 'bbPaidAmount')) message.bbPaidAmount = data.bbPaidAmount;
    if (type === 0) Object.assign(message, { authorType: number(data.authorType), content: str(data.content),
      contentParts: clone(record.contentParts || data.contentParts || (data.emoticon ? [{ type: 1, text: str(data.content), url: data.emoticon, width: 0, height: 0 }] : [{ type: 0, text: str(data.content) }])),
      repeated: 1, translation: str(data.translation), isMirror: Boolean(data.isMirror) });
    else if (type === 1) Object.assign(message, { price: number(data.totalCoin) / 1000, giftName: str(data.giftName), num: number(data.num, 1),
      totalFreeCoin: number(data.totalFreeCoin), giftId: data.giftId ?? 0, giftIconUrl: str(data.giftIconUrl), authorNamePronunciation: '' });
    else if (type === 2) Object.assign(message, { title: this.translate('chat.membershipTitle'), num: number(data.num, 1), unit: str(data.unit),
      price: number(data.totalCoin) / 1000, authorNamePronunciation: '' });
    else Object.assign(message, { price: number(data.price), content: str(data.content).trim(), translation: str(data.translation), authorNamePronunciation: '' });
    return message;
  }
  append(record, notify) {
    if (this.config.hostNativeTextFilter && isTextRecord(record)) return this.appendNativeText(record, notify);
    const message = this.project(record, !notify); if (!message) return;
    const { config } = this;
    let liveMergeHandled = false;
    const liveMerger = message.type === 0 ? this.sink.mergeSimilarText : message.type === 1 ? this.sink.mergeSimilarGift : null;
    if (notify && !(config.hostPaidFilter && message.type === 1) && !config.templateUrl && liveMerger && (message.type === 0 && config.mergeSimilarDanmaku || message.type === 1 && config.mergeGift)) {
      liveMergeHandled = true;
      const targetId = message.type === 0 ? liveMerger(message.content) : liveMerger(message.authorName, message.price, message.totalFreeCoin, message.giftName, message.num);
      if (targetId) {
        record.mergedInto = targetId;
        const previous = this.projectedById.get(targetId);
        if (previous) { if (message.type === 0) previous.repeated++; else { previous.price += message.price; previous.num += message.num; mergePaidMetadata(previous, message); } }
        return;
      }
    }
    // Custom templates own their own merge behavior, exactly as upstream CustomTemplateRenderer.
    if (!liveMergeHandled && !config.templateUrl && (message.type === 0 && config.mergeSimilarDanmaku || message.type === 1 && config.mergeGift)) {
      for (const previous of this.recentForRebuild(record).reverse()) {
        let values;
        if (message.type === 0 && previous.type === 0) {
          const one = message.content.trim().toLowerCase(), two = previous.content.trim().toLowerCase();
          const [longer, shorter] = one.length > two.length ? [one, two] : [two, one];
          if (longer.includes(shorter) && longer.length - shorter.length < shorter.length) values = { repeated: 1 };
        } else if (message.type === 1 && previous.type === 1 && previous.authorName === message.authorName && previous.giftName === message.giftName)
          values = { price: message.price, num: message.num };
        if (values) {
          record.mergedInto = previous.id;
          for (const [key, value] of Object.entries(values)) previous[key] += value;
          if (message.type === 1) mergePaidMetadata(previous, message);
          if (notify) {
            this.sink.updateMessage?.(previous.id, config.hostPaidFilter && message.type === 1
              ? { price: previous.price, num: previous.num } : { $add: values });
            if (config.hostPaidFilter) this.sink.setMainVisibility?.(previous.id, this.isMainVisible(previous), { ...previous });
          }
          return;
        }
      }
    }
    // Upstream applies gift minimum only AFTER attempting merge; membership is not price-filtered.
    if (!config.hostPaidFilter && (message.type === 1 || message.type === 3) && message.price < config.minGiftPrice) return;
    delete record.mergedInto;
    this.projected.push(message); this.projectedById.set(message.id, message);
    if (notify) this.sink.addMessage?.({ ...message });
  }
  allRecords() { return [...this.liveRecords.values(), ...this.records.values()].sort((a, b) => a.order - b.order); }
  ensureTextLedgers(checkOnly) {
    let raw = this.recordBytes, live = this.liveBytes;
    for (const record of this.allRecords()) if (isTextRecord(record) && !record.text) {
      if (this.liveRecords.has(record.id)) live += TEXT_LEDGER_BYTES; else raw += TEXT_LEDGER_BYTES;
    }
    if (raw > this.retention.maxBytes || live > this.retention.maxLiveBytes) throw new Error('文本成员记录超过预览保留容量');
    if (checkOnly) return;
    for (const record of this.allRecords()) if (isTextRecord(record) && !record.text) { record.text = newTextLedger(record); record.bytes += TEXT_LEDGER_BYTES; }
    this.recordBytes = raw; this.liveBytes = live;
  }
  consumeHiddenText(record) {
    // A real queued/resolving admission may need recovery without ever having
    // occupied main or buffer. Its bounded intent is not a fictitious lane.
    record.text.recoverable ||= !!(record.text.pending || record.resolving || record.text.lane);
    record.text.hidden = true;
    record.text.phase = 'consumed';
    record.text.consumedAt ??= this.now();
    record.firstPresentedAt ??= record.text.consumedAt;
  }
  startUnpreparedText() {
    if (!this.config.hostNativeTextFilter || !this.resolveParts) return;
    for (const record of this.allRecords()) if (record.text && !record.contentParts && !record.resolving && this.project(record)) this.prepareParts(record);
  }
  /** Pure, bounded plan. Pending increments never become visible contributions. */
  planText(config, consumed = null, forcedGroup = null, consumeLane = 'buffer') {
    const records = this.allRecords().filter(record => record.text);
    const states = new Map(records.map(record => [record, { ...record.text }]));
    const lanes = this.sink.readTextLanes?.() || { main: [], buffer: [], queue: [] };
    const main = [...lanes.main], buffer = [...lanes.buffer];
    const affected = new Set(forcedGroup === null ? [] : [forcedGroup]);
    let projected = [...this.projected];
    const groupOf = message => states.get(this.getRecord(message.id))?.group;
    for (const record of records) {
      const state = states.get(record);
      const hidden = !!this.project(record, true, config, false) && !nativeTextAllowed(record, config);
      if (hidden !== state.hidden) {
        state.hidden = hidden;
        if (state.group !== null) affected.add(state.group);
        // The product gate settles a rejected pending operation, but retains its
        // pending token until actual delivery. An allowed pending member is untouched.
        if (hidden) {
          state.recoverable ||= !!(state.pending || record.resolving || state.lane);
          state.phase = 'consumed'; state.consumedAt ??= this.now();
        }
      }
      if (record === consumed) {
        state.phase = 'consumed'; state.pending = false; state.consumedAt ??= this.now();
        // Rejected queue delivery never occupied the source buffer. Preserve a
        // real prior lane, but do not invent one for a product-consumed member.
        if (!hidden && !state.evicted && this.project(record, true, config)) state.lane ||= consumeLane;
        if (state.group !== null) affected.add(state.group);
      }
    }
    const ready = record => !this.resolveParts || !!record.contentParts;
    const rebuildGroup = group => {
      const members = records.filter(record => states.get(record).group === group).sort((a, b) => a.order === group ? -1 : b.order === group ? 1 : (a.deliveryOrder ?? a.order) - (b.deliveryOrder ?? b.order));
      const oldMain = main.find(message => groupOf(message) === group);
      const oldBuffer = buffer.find(message => groupOf(message) === group);
      const lane = oldMain ? 'main' : oldBuffer ? 'buffer' : members.map(record => states.get(record).lane).find(Boolean) || 'main';
      for (const record of members) if (oldMain || oldBuffer) states.get(record).lane = lane;
      const eligible = members.filter(record => !states.get(record).evicted && ready(record) && this.project(record, true, config));
      const applied = eligible.filter(record => states.get(record).phase === 'consumed');
      const rows = [];
      for (const member of applied) {
        const value = this.project(member, true, config);
        const targetId = config.mergeSimilarDanmaku && !config.templateUrl
          ? this.sink.findNativeTextGroup?.(value.content, { main: rows, buffer: [], queue: [] }) : null;
        const target = rows.find(row => row.id === targetId);
        if (target) { target.repeated++; states.get(member).viewRoot = this.getRecord(target.id).order; }
        else { value.addTime = new Date(states.get(member).consumedAt ?? member.receivedAt); rows.push(value); states.get(member).viewRoot = member.order; }
      }
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i], previous = [...main, ...buffer].find(item => item.id === row.id);
        if (previous && previous.repeated === row.repeated && previous.translation === row.translation) rows[i] = previous;
      }
      // Keep the actual row position/lane when replacing a root. New recoveries
      // with no buffered history enter main directly, not an unflushed buffer.
      for (const [items, name] of [[main, 'main'], [buffer, 'buffer']]) {
        const index = items.findIndex(message => groupOf(message) === group);
        for (let i = items.length - 1; i >= 0; i--) if (groupOf(items[i]) === group) items.splice(i, 1);
        if (rows.length && name === lane) {
          if (index >= 0) items.splice(index, 0, ...rows);
          else {
            const at = items.findIndex(message => (groupOf(message) ?? this.getRecord(message.id)?.order ?? Infinity) > group);
            items.splice(at < 0 ? items.length : at, 0, ...rows);
          }
        }
      }
      projected = projected.filter(message => groupOf(message) !== group);
      const pendingRoot = eligible.find(record => states.get(record).phase === 'pending-add');
      if (rows.length) projected.push(...rows);
      else if (pendingRoot) projected.push(this.project(pendingRoot, true, config));
    };
    for (const group of affected) rebuildGroup(group);
    // Initially hidden members have no historical merge group. Only these may
    // search the real renderer's recent-five algorithm on restoration.
    for (const record of records) {
      const state = states.get(record);
      if (state.group !== null || state.phase !== 'consumed' || state.evicted || !ready(record) || !this.project(record, true, config)) continue;
      const targetId = config.mergeSimilarDanmaku && !config.templateUrl
        ? this.sink.findNativeTextGroup?.(this.project(record, true, config).content, { main, buffer, queue: lanes.queue }) : null;
      state.group = states.get(this.getRecord(targetId))?.group ?? record.order;
      state.lane ||= record === consumed ? consumeLane : 'main';
      affected.add(state.group); rebuildGroup(state.group);
    }
    projected.sort((a, b) => (groupOf(a) ?? this.getRecord(a.id)?.order ?? 0) - (groupOf(b) ?? this.getRecord(b.id)?.order ?? 0));
    // Existing budgets include the fixed ledger reservation. No secondary archive.
    if (this.recordBytes > this.retention.maxBytes || this.liveBytes > this.retention.maxLiveBytes
      || this.records.size > this.retention.maxRecords || this.liveRecords.size > this.retention.maxLiveRecords)
      throw new Error('文本重构超过预览保留容量');
    return { states, projected, main: main.slice(-config.maxNumber), buffer, affected };
  }
  commitText(plan) {
    for (const [record, state] of plan.states) {
      record.text = state;
      if (state.consumedAt !== null) record.firstPresentedAt ??= state.consumedAt;
    }
    this.projected = plan.projected;
    this.projectedById = new Map(this.projected.map(message => [message.id, message]));
  }
  reconcileText(consumed = null, group = null, lane = 'buffer') {
    const plan = this.planText(this.config, consumed, group, lane);
    this.commitText(plan); this.sink.applyNativeText?.(plan);
  }
  observeTextLanes() {
    if (!this.config.hostNativeTextFilter || this.config.templateUrl) return;
    const lanes = this.sink.readTextLanes?.(); if (!lanes) return;
    const roots = new Map();
    for (const [items, lane] of [[lanes.main, 'main'], [lanes.buffer, 'buffer']]) for (const message of items) {
      const record = this.getRecord(message.id);
      if (record?.text) roots.set(record.order, lane);
    }
    for (const record of this.allRecords()) {
      const state = record.text; if (!state || state.group === null) continue;
      if (roots.has(state.viewRoot ?? state.group)) state.lane = roots.get(state.viewRoot ?? state.group);
      else if (state.phase === 'consumed' && !state.hidden && state.lane && this.project(record) && (!this.resolveParts || record.contentParts)) state.evicted = true;
    }
    this.projected = this.projected.filter(message => !this.getRecord(message.id)?.text?.evicted);
    this.projectedById = new Map(this.projected.map(message => [message.id, message]));
  }
  getTextOperationRecord(token) {
    if (!token || token.session !== this.session) return null;
    const record = this.getRecord(token.member);
    return record?.text ? record : null;
  }
  finishTextOperation(token) {
    const record = this.getTextOperationRecord(token);
    if (!record?.text.pending) return;
    // Upstream discards an interrupted spliced group. Do not preserve a phantom
    // pending token forever or retry an operation with unknown delivery outcome.
    record.text.pending = false; record.text.phase = 'abandoned'; record.text.evicted = true;
  }
  consumeTextOperation(token) {
    const record = this.getTextOperationRecord(token);
    if (!record || !this.config.hostNativeTextFilter) return;
    this.reconcileText(record, record.text.group);
  }
  bindTextMerge(record, targetId) {
    const target = this.getRecord(targetId);
    if (!target?.text || target.text.group === null) throw new Error('文本合并目标缺少成员记录');
    record.text.group = target.text.group; record.text.phase = 'pending-merge'; record.text.pending = true;
    return textOperation(this, record);
  }
  appendNativeText(record, notify) {
    const message = this.project(record, !notify);
    if (!message) {
      if (this.project(record, true, this.config, false) && !nativeTextAllowed(record, this.config)) this.consumeHiddenText(record);
      return;
    }
    if (!notify || !this.sink.addMessage || this.config.templateUrl) {
      if (record.text.phase === 'new') {
        record.text.phase = 'consumed'; record.text.consumedAt ??= record.firstPresentedAt ?? record.receivedAt;
        record.text.lane = 'main';
        // Full-source rebuild retains the original hot projection contract.
        if (!this.config.templateUrl && this.config.mergeSimilarDanmaku) {
          const targetId = this.sink.findNativeTextGroup?.(message.content, { main: this.projected, buffer: [], queue: [] });
          record.text.group = this.getRecord(targetId)?.text?.group ?? null;
        }
      }
      this.reconcileText(null, record.text.group, 'main');
      if (notify && this.config.templateUrl) this.sink.addMessage?.(this.projectedById.get(record.id) || message);
      return;
    }
    if (record.text.phase === 'consumed') { this.reconcileText(null, record.text.group, 'main'); return; }
    if (this.config.mergeSimilarDanmaku && this.sink.mergeSimilarText) {
      const targetId = this.sink.mergeSimilarText(message.content, record);
      if (targetId) return;
    }
    record.text.group = record.order; record.text.phase = 'pending-add'; record.text.pending = true;
    this.projected.push(message); this.projectedById.set(message.id, message);
    this.sink.addMessage({ ...message }, textOperation(this, record));
  }
  recentForRebuild(incoming) {
    // Reconstruct original residency at delivery: pending additions count before capped
    // displayed rows. Previously filtered/newly split rows have immediate acceptance as
    // a deterministic hot-update extension, not a claim of an upstream hot-config API.
    const deliveredAt = incoming.deliveryAt ?? incoming.receivedAt;
    const queued = [], displayed = [];
    for (const message of this.projected) {
      const record = this.getRecord(message.id);
      if (record?.firstPresentedAt !== undefined && record.firstPresentedAt > deliveredAt) queued.push(message);
      else displayed.push(message);
    }
    return displayed.slice(-this.config.maxNumber).concat(queued).slice(-5);
  }
  rebuild(prune = true) {
    if (prune) this.prune();
    this.projectionVersion++;
    this.projected = []; this.projectedById = new Map();
    if (this.config.hostNativeTextFilter) for (const record of this.allRecords()) {
      if (record.text) { record.text.group = null; record.text.phase = 'new'; record.text.pending = false; record.text.evicted = false; }
    }
    for (const record of [...this.liveRecords.values(), ...this.records.values()].sort((a, b) => (a.deliveryAt ?? a.receivedAt) - (b.deliveryAt ?? b.receivedAt) || (a.deliveryOrder ?? a.order) - (b.deliveryOrder ?? b.order))) {
      if (this.resolveParts && types[record.method] === 0 && !record.contentParts) {
        if (this.project(record)) this.prepareParts(record);
        else if (record.text && this.project(record, true, this.config, false) && !nativeTextAllowed(record, this.config)) this.consumeHiddenText(record);
        continue;
      }
      this.append(record, false);
    }
    const snapshot = this.snapshot(); this.sink.replace?.(snapshot.messages, snapshot.paidMessages);
    return snapshot;
  }
  isCategoryVisible(message, config = this.config) {
    return !config.hostEventFilter || (message.type !== 2 || config.hostShowGuard)
      && (message.type !== 3 || config.hostShowSuperChat);
  }
  isMainVisible(message, config = this.config) {
    return this.isCategoryVisible(message, config) && (!config.hostPaidFilter || paidAmountVisible(message.bbPaidAmount, config.hostPaidThreshold, config.hostPaidMode));
  }
  snapshot() {
    const now = this.now();
    return { messages: this.projected.filter(m => this.isMainVisible(m)).slice(-this.config.maxNumber).map(m => ({ ...m })),
      paidMessages: this.projected.filter(m => m.type !== 0 && this.isCategoryVisible(m)).slice(-100).reverse().filter(m => isPinned(m, now)).map(m => ({ ...m })),
      stats: this.stats() };
  }
  async drain() { while (this.pending.size) await Promise.all([...this.pending]); }
  stats() { return { callbacks: this.journal.length, records: this.records.size, projected: this.projected.length,
    rawBytes: this.journalBytes, recordBytes: this.recordBytes, liveRecords: this.liveRecords.size, liveBytes: this.liveBytes, tombstones: this.tombstones.size, tombstoneBytes: this.tombstoneBytes, tombstoneOverflow: this.tombstoneOverflow,
    droppedCallbacks: this.droppedCallbacks, droppedRecords: this.droppedRecords, retention: this.retention }; }
}
