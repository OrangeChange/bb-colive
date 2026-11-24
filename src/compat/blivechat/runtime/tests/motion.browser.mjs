/** Run in a real Chrome renderer document with runMotionCase({ preset, direction }). */
export function managedStickyRecords(now = Date.now()) {
  return ['onAddGift', 'onAddSuperChat'].map((method, index) => ({
    record: { method, payload: { id: `motion-sticky-${index}`, authorName: '置顶字体验证',
      totalCoin: 700000, giftName: '礼物', num: 1, price: 700, content: '置顶醒目留言' } },
    startedAt: now, expiresAt: now + 600000,
  }));
}

export async function runMotionCase({ preset = 'lift', direction = 'top', sourceAnimation = false, channel = 'bb-blivechat' } = {}) {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const send = (command, data) => window.postMessage({ type: channel, command, data }, location.origin);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const settle = async () => { await frame(); await frame(); await pause(220); await frame(); };
  const rows = () => [...document.querySelectorAll('#items.yt-live-chat-item-list-renderer > [data-compatible-event-id],#chat-items > [data-compatible-event-id]')];
  const waitRows = async ids => {
    const until = Date.now() + 6000;
    while (rows().map(node => node.dataset.compatibleEventId).join() !== ids.join()) {
      assert(Date.now() < until, `呈现顺序错误：${rows().map(node => node.dataset.compatibleEventId)}，期望 ${ids}`);
      await pause(20);
    }
    await settle();
  };
  const presentation = (ids, removing) => ({ layout: ids.map(eventId => ({ eventId, kind: 'source', removing: eventId === removing })),
    stickyRecords: managedStickyRecords(), direction, contentAlignment: 'top', position: 'top', animation: { preset, durationMs: 120 } });
  const ordered = ids => direction === 'top' ? ids.slice().reverse() : ids;
  send('reset');
  send('host', { managed: true, scale: 1, tickerEnabled: true, direction });
  send('config', { mergeSimilarDanmaku: false, mergeGift: false, minGiftPrice: 0, maxNumber: 100 });
  send('css', { css: sourceAnimation ? '@keyframes motion-source-enter{from{transform:translateX(-8px)}to{transform:translateX(0)}} #items.yt-live-chat-item-list-renderer > [data-compatible-event-id],#chat-items > [data-compatible-event-id]{animation:motion-source-enter .12s ease-out both}' : '' });
  send('presentation', presentation([]));
  await waitRows([]);
  const enters = {}, animations = {}, transitions = {}, references = new Map(), history = [], detached = [];
  let trackingRemoval = true;
  const onAnimation = event => {
    const id = event.target.dataset.compatibleEventId;
    if (id && event.animationName === 'motion-source-enter') animations[id] = (animations[id] || 0) + 1;
  };
  const onTransition = event => {
    const id = event.target.dataset.compatibleEventId;
    if (id) { transitions[id] ??= {}; transitions[id][event.propertyName] = (transitions[id][event.propertyName] || 0) + 1; }
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target.hasAttribute('data-event-motion-entering')) {
        const id = record.target.dataset.compatibleEventId;
        enters[id] = (enters[id] || 0) + 1;
      }
      if (record.type === 'childList') for (const node of record.removedNodes) {
        const id = node.dataset?.compatibleEventId;
        if (trackingRemoval && references.get(id) === node) detached.push(id);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-event-motion-entering'] });
  document.addEventListener('animationstart', onAnimation, true);
  document.addEventListener('transitionrun', onTransition, true);
  const prefix = `${channel}-${direction}-${preset}-${sourceAnimation}`;
  const records = [
    { method: 'onAddText', payload: { content: '持续入流弹幕', authorType: 0, authorLevel: 60, isMobileVerified: true } },
    { method: 'onAddGift', payload: { totalCoin: 70000, giftName: '礼物', num: 1 } },
    { method: 'onAddMember', payload: { privilegeType: 3, title: '开通1月舰长', num: 1 } },
    { method: 'onAddSuperChat', payload: { price: 700, content: '醒目留言' } },
  ].map((record, index) => ({ ...record, payload: { ...record.payload, id: `${prefix}-${index}`, authorName: '动画验证' } }));
  const ids = [];
  const checkRetained = () => {
    for (const [id, node] of references) {
      assert(rows().find(row => row.dataset.compatibleEventId === id) === node, `${id} 节点被重建`);
      assert((enters[id] || 0) === (preset === 'none' ? 0 : 1), `${id} 进场次数：${enters[id] || 0}`);
      assert((animations[id] || 0) === (sourceAnimation ? 1 : 0), `${id} 来源动画次数：${animations[id] || 0}`);
    }
    assert(detached.length === 0, `旧节点被移出：${detached}`);
  };
  try {
    for (const record of records) {
      ids.push(record.payload.id);
      send('event-batch', { records: [record], presentation: presentation(ordered(ids)) });
      await waitRows(ordered(ids));
      checkRetained();
      for (const node of rows()) references.set(node.dataset.compatibleEventId, node);
      checkRetained();
      history.push({ ids: ordered(ids).slice(), identitiesPreserved: true, enters: { ...enters }, sourceStarts: { ...animations }, transitions: structuredClone(transitions) });
    }
    const appendTransitions = structuredClone(transitions);
    if (!sourceAnimation) for (const id of ids) {
      const expected = preset === 'none' ? {} : { opacity: 1, ...(preset === 'scale' ? { scale: 1 } : preset === 'fade' ? {} : { translate: 1 }) };
      assert(JSON.stringify(Object.entries(transitions[id] || {}).sort()) === JSON.stringify(Object.entries(expected).sort()), `${id} 实际进场过渡：${JSON.stringify(transitions[id])}`);
    }
    trackingRemoval = false;
    const reversed = ordered(ids).slice().reverse();
    send('presentation', { ...presentation(reversed), direction: direction === 'top' ? 'bottom' : 'top' });
    await waitRows(reversed); checkRetained();
    send('presentation', presentation(ordered(ids)));
    await waitRows(ordered(ids)); checkRetained();
    trackingRemoval = true;
    send('event-batch', { records: [{ method: 'onUpdateTranslation', payload: { id: ids[3], translation: '译文更新' } }], presentation: presentation(ordered(ids)) });
    await settle(); checkRetained();
    const updated = records.map((record, index) => index === 0 ? { ...record, payload: { ...record.payload, content: '正文更新' } } : record);
    send('hydrate', { records: updated, presentation: presentation(ordered(ids)) });
    await waitRows(ordered(ids)); checkRetained();
    assert(references.get(ids[0]).textContent.includes('正文更新'), '正文更新未显示');
    const deleted = ids[3];
    send('presentation', presentation(ordered(ids), deleted));
    await settle(); checkRetained();
    references.delete(deleted);
    send('event-batch', { records: [{ method: 'onDelSuperChat', payload: { ids: [deleted] } }], presentation: presentation(ordered(ids.slice(0, -1))) });
    await waitRows(ordered(ids.slice(0, -1))); checkRetained();
    return { preset, direction, sourceAnimation, channel, history, appendTransitions, finalEnters: enters, finalSourceStarts: animations,
      detached, sortSwitchPreserved: true, updatePreserved: true, deletionPreserved: true, stickyCount: document.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer').length };
  } finally {
    observer.disconnect(); document.removeEventListener('animationstart', onAnimation, true); document.removeEventListener('transitionrun', onTransition, true);
  }
}

/** Continue the final top/lift/source-animation case with overlapping arrivals. */
export async function runMotionStream() {
  const rows = () => [...document.querySelectorAll('#items.yt-live-chat-item-list-renderer > [data-compatible-event-id]')];
  const initial = rows().map(node => node.dataset.compatibleEventId);
  const references = new Map(rows().map(node => [node.dataset.compatibleEventId, node]));
  const enters = {}, sourceStarts = {}, transitions = {}, sent = [], samples = [];
  const round = Date.now();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = (command, data) => postMessage({ type: 'bb-blivechat', command, data }, location.origin);
  const observer = new MutationObserver(records => {
    for (const record of records) if (record.target.hasAttribute('data-event-motion-entering')) {
      const id = record.target.dataset.compatibleEventId; enters[id] = (enters[id] || 0) + 1;
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-event-motion-entering'] });
  const onAnimation = event => { const id = event.target.dataset.compatibleEventId; if (id && event.animationName === 'motion-source-enter') sourceStarts[id] = (sourceStarts[id] || 0) + 1; };
  const onTransition = event => { const id = event.target.dataset.compatibleEventId; if (id) { transitions[id] ??= {}; transitions[id][event.propertyName] = (transitions[id][event.propertyName] || 0) + 1; } };
  document.addEventListener('animationstart', onAnimation, true);
  document.addEventListener('transitionrun', onTransition, true);
  const sample = () => {
    const nodes = rows();
    for (const [id, node] of references) if (!nodes.includes(node)) throw Error(`${id} 入流期间节点身份改变`);
    for (const node of nodes) references.set(node.dataset.compatibleEventId, node);
    samples.push({ at: performance.now(), ids: nodes.map(node => node.dataset.compatibleEventId), identitiesPreserved: true });
  };
  try {
    for (let index = 0; index < 12; index++) {
      const id = `motion-stream-${round}-${index}`;
      sent.push({ id, at: performance.now() });
      const ids = sent.map(item => item.id).reverse().concat(initial);
      send('event-batch', { records: [{ method: 'onAddText', payload: { id, content: `连续入流 ${index + 1}`, authorName: '动画验证', authorType: 0, authorLevel: 60, isMobileVerified: true } }],
        presentation: { layout: ids.map(eventId => ({ kind: 'source', eventId })), stickyRecords: managedStickyRecords(), direction: 'top', position: 'top', contentAlignment: 'top', animation: { preset: 'lift', durationMs: 350 } } });
      await pause(80); sample();
    }
    const until = Date.now() + 15000;
    while (rows().length !== initial.length + sent.length) {
      if (Date.now() > until) throw Error('持续入流未全部呈现');
      await pause(100); sample();
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await pause(500);
    await new Promise(resolve => requestAnimationFrame(resolve)); sample();
    for (const id of initial) if (enters[id] || sourceStarts[id] || transitions[id]) throw Error(`${id} 旧事件重复进场`);
    for (const { id } of sent) if (enters[id] !== 1 || sourceStarts[id] !== 1 || transitions[id]?.opacity !== 1 || transitions[id]?.translate !== 1) throw Error(`${id} 新事件动画次数错误：${JSON.stringify({enters,sourceStarts,transitions})}`);
    return { sent, samples, enters, sourceStarts, transitions, existingIdentitiesPreserved: true, existingReplays: 0 };
  } finally {
    observer.disconnect(); document.removeEventListener('animationstart', onAnimation, true); document.removeEventListener('transitionrun', onTransition, true);
  }
}
