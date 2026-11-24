/** Keeps the complete preview history while projecting a small source window. */
export function createPreviewWindow({ renderer, hydrate, scroller, afterRender, windowSize = 60 }) {
  let records = [], start = 0, generation = 0, tail = Promise.resolve(), active = false;
  const recycled = new Set();
  const originalLeave = renderer.onMessageLeave;
  if (originalLeave) renderer.onMessageLeave = function(node, done) {
    if (recycled.delete(node.dataset.compatibleEventId)) { done(); return; }
    return originalLeave.call(this, node, done);
  };
  const idOf = record => String((record.payload ?? record.data)?.id ?? '');
  const row = id => [...scroller.querySelectorAll('[data-compatible-event-id]')].find(node => node.dataset.compatibleEventId === id);
  const anchor = () => {
    const top = scroller.getBoundingClientRect().top;
    const node = [...scroller.querySelectorAll('[data-compatible-event-id]')].find(item => item.getBoundingClientRect().bottom >= top);
    return node && { id: node.dataset.compatibleEventId, offset: node.getBoundingClientRect().top - top };
  };
  function render(nextStart, saved, token) {
    tail = tail.catch(() => {}).then(async () => {
      if (!active || token !== generation) return false;
      const next = records.slice(nextStart, nextStart + windowSize), nextIds = new Set(next.map(idOf)), allIds = new Set(records.map(idOf));
      for (const node of scroller.querySelectorAll('[data-compatible-event-id]')) {
        const id = node.dataset.compatibleEventId;
        if (allIds.has(id) && !nextIds.has(id)) recycled.add(id);
      }
      try { await hydrate(next); } finally { recycled.clear(); }
      if (!active || token !== generation) return false;
      await afterRender();
      if (!active || token !== generation) return false;
      const node = saved && row(saved.id);
      if (node) scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.offset;
      start = nextStart;
      return true;
    });
    return tail;
  }
  function replace(nextRecords, { fromStart = false } = {}) {
    records = nextRecords; active = true; const token = ++generation;
    return render(fromStart ? 0 : Math.max(0, records.length - windowSize), null, token).then(rendered => {
      if (rendered && fromStart) { scroller.scrollTop = 0; renderer.atBottom = false; }
      return rendered;
    });
  }
  function move(direction) {
    if (!active) return Promise.resolve(false);
    const step = Math.floor(windowSize / 2), max = Math.max(0, records.length - windowSize);
    const next = Math.max(0, Math.min(max, start + (direction === 'backward' ? -step : step)));
    return next === start ? Promise.resolve(false) : render(next, anchor(), ++generation);
  }
  function locate(id) {
    const index = records.findIndex(record => idOf(record) === id);
    if (index < 0) return Promise.resolve(false);
    const next = Math.max(0, Math.min(Math.max(0, records.length - windowSize), index - Math.floor(windowSize / 2)));
    return render(next, null, ++generation).then(rendered => { if (rendered) row(id)?.scrollIntoView({block:'center'}); return rendered; });
  }
  function latest() { return render(Math.max(0, records.length - windowSize), null, ++generation); }
  function cancel() { active = false; records = []; recycled.clear(); ++generation; }
  return { replace, move, locate, latest, cancel, get active() { return active; }, get records() { return records; }, get start() { return start; } };
}

/** 标记同范围节点，只将实际点选事件或首个确定样例定位一次。 */
export function markPreviewEditorSelection(doc, selection, { scroll = false, schedule = queueMicrotask, reveal = () => {} } = {}) {
  const nodes = new Set();
  const collect = selectors => {
    for (const selector of selectors) try {
      for (const node of doc.querySelectorAll(selector)) nodes.add(node);
    } catch {}
  };
  collect(selection.focusSelectors ?? []);
  if (!nodes.size && !selection.strictScope) collect(selection.selectors?.[selection.part] ?? []);
  for (const node of doc.querySelectorAll('[data-compatible-editor-selected]')) if (!nodes.has(node)) node.removeAttribute('data-compatible-editor-selected');
  for (const node of nodes) {
    node.setAttribute('data-compatible-editor-selected', '');
    if (selection.reveal) for (let parent = node; parent; parent = parent.parentElement) reveal(parent);
  }
  const target = [...nodes].find(node => node.closest('[data-compatible-event-id]')?.dataset.compatibleEventId === selection.eventId) ?? [...nodes][0];
  if (scroll && !selection.readOnly && selection.pickEnabled !== false && target) schedule(() => {
    if (target.isConnected) target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  });
  return target;
}

/** 点选身份使用事件自身的属性和编辑器已有的身份优先级。 */
export function previewEditorIdentity(node, selection) {
  const event = node.closest('[data-compatible-event-id]') ?? node;
  const identities = selection.scopeSelectors?.identities ?? {};
  const priority = [...new Set([...(selection.identityPriority ?? []), ...Object.keys(identities)])];
  for (const identity of priority) {
    const selector = identities[identity];
    if (selector) try { if (event.matches(selector)) return identity; } catch {}
  }
  return 'all';
}

export function previewEditorSelectionNeedsScroll(previous, next) {
  if (!next || next.readOnly || next.pickEnabled === false) return false;
  const target = selection => selection ? [selection.part, selection.scope, selection.eventId, selection.focusSelectors] : null;
  return JSON.stringify(target(previous)) !== JSON.stringify(target(next));
}
