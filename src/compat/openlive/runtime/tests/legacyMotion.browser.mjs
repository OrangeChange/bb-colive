/** Run in the OpenLive document; exercises the CEF 127 insertion path. */
export async function runOpenLiveLegacyMotion() {
  const selector = '#chat-items';
  const items = document.querySelector(selector);
  items.moveBefore = undefined;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const settle = async () => { await frame(); await frame(); await pause(180); await frame(); };
  const send = (command, data) => postMessage({ type: 'bb-openlive', command, data }, location.origin);
  const rows = () => [...items.children].filter(node => node.dataset.compatibleEventId);
  const ids = ['legacy-a', 'legacy-b', 'legacy-c'];
  const record = id => ({ method: id === 'legacy-c' ? 'onAddSuperChat' : 'onAddText', payload: { id, content: id, price: 700, authorName: '方向切换验证', authorType: 0, authorLevel: 60, isMobileVerified: true } });
  const presentation = (order, preset = 'lift') => ({ layout: order.map(eventId => ({ kind: 'source', eventId })), stickyRecords: [],
    direction: order[0] === 'legacy-d' ? 'top' : 'bottom', position: 'top', contentAlignment: 'top', animation: { preset, durationMs: 120 } });
  const waitOrder = async order => {
    const until = Date.now() + 6000;
    while (rows().map(node => node.dataset.compatibleEventId).join() !== order.join()) {
      if (Date.now() > until) throw Error('事件顺序未更新');
      await pause(20);
    }
    await settle();
  };
  const starts = [], reads = [], snapshots = [];
  const onStart = event => {
    const row = event.target.closest?.('[data-compatible-event-id]');
    if (row) starts.push({ id: row.dataset.compatibleEventId, name: event.animationName, elapsedTime: event.elapsedTime });
  };
  const nativeGetAnimations = Element.prototype.getAnimations;
  Element.prototype.getAnimations = function(options) {
    if (this.parentNode === items) reads.push(this.dataset.compatibleEventId);
    return nativeGetAnimations.call(this, options);
  };
  const snapshot = () => rows().map(row => ({ id: row.dataset.compatibleEventId, node: row,
    opacity: getComputedStyle(row).opacity,
    animations: nativeGetAnimations.call(row, { subtree: true }).filter(animation => animation instanceof CSSAnimation).map(animation => ({
      target: animation.effect.target.id || animation.effect.target.tagName, pseudo: animation.effect.pseudoElement,
      name: animation.animationName, time: animation.currentTime, state: animation.playState,
    })),
  }));
  const check = (value, message) => { if (!value) { const error = Error(message); error.evidence = { starts, reads, snapshots }; throw error; } };
  document.addEventListener('animationstart', onStart, true);
  try {
    send('reset'); send('host', { managed: true, scale: 1, tickerEnabled: false, direction: 'bottom' });
    send('config', { mergeSimilarDanmaku: false, mergeGift: false, minGiftPrice: 0, maxNumber: 100 });
    send('css', { css: `
@keyframes legacy-entry{from{opacity:0}to{opacity:1}}
@keyframes legacy-root-decoration{from{outline-color:rgb(0,0,0)}to{outline-color:rgb(100,100,100)}}
@keyframes legacy-decoration{from{transform:translateX(0)}to{transform:translateX(2px)}}
@keyframes legacy-paused{from{opacity:1}to{opacity:.9}}
@keyframes legacy-fill{from{opacity:0}to{opacity:.75}}
${selector}>[data-compatible-event-id]{animation:legacy-entry .12s,legacy-root-decoration 40s linear infinite}
${selector}>[data-compatible-event-id] #message{animation:legacy-decoration 40s linear infinite}
${selector}>[data-compatible-event-id] #author-name{animation:legacy-paused 40s linear infinite paused}
${selector}>[data-compatible-event-id] #message::after{content:' ·';animation:legacy-fill .12s both}
` });
    send('hydrate', { records: ids.map(record), presentation: presentation(ids) });
    await waitOrder(ids);
    const references = new Map(rows().map(node => [node.dataset.compatibleEventId, node]));
    const order = ['legacy-d', ...ids.slice().reverse()];
    reads.length = 0;
    send('event-batch', { records: [record('legacy-d')], presentation: { ...presentation(order), direction: 'top' } });
    await waitOrder(order);
    const appendReads = reads.slice();
    check(!appendReads.includes('legacy-d'), '新节点不应读取 getAnimations');
    for (const [id, node] of references) check(rows().find(row => row.dataset.compatibleEventId === id) === node, '持续入流替换了旧节点');
    for (const id of order) check(starts.filter(event => event.id === id && event.name === 'legacy-entry').length === 1, `${id} 持续入流重复进场`);
    for (const row of rows()) for (const animation of nativeGetAnimations.call(row, { subtree: true })) {
      if (animation.animationName === 'legacy-root-decoration') animation.currentTime = 9000;
      if (animation.animationName === 'legacy-decoration') animation.currentTime = 12000;
      if (animation.animationName === 'legacy-paused') animation.currentTime = 3210;
    }
    await frame();
    const before = snapshot();
    const baselineEntryCounts = Object.fromEntries(order.map(id => [id, starts.filter(event => event.id === id && event.name === 'legacy-entry').length]));
    snapshots.push({ phase: 'before', rows: before.map(({ node, ...value }) => value) });
    const switches = [order.slice().reverse(), order];
    for (const next of switches) {
      const previous = snapshot();
      send('presentation', { ...presentation(next), direction: next[0] === 'legacy-d' ? 'top' : 'bottom' });
      await waitOrder(next);
      const after = snapshot();
      snapshots.push({ phase: 'switch', rows: after.map(({ node, ...value }) => value) });
      for (const old of previous) {
        const current = after.find(value => value.id === old.id);
        check(current.node === old.node, `${old.id} 方向切换替换节点`);
        check(current.opacity === '1', `${old.id} 方向切换回到进场透明度`);
        check(starts.filter(event => event.id === old.id && event.name === 'legacy-entry').length === baselineEntryCounts[old.id], `${old.id} 方向切换重复进场`);
        for (const animation of old.animations) {
          const retained = current.animations.find(value => value.name === animation.name && value.target === animation.target && value.pseudo === animation.pseudo);
          check(retained, `${old.id}/${animation.name} 动画丢失`);
          if (animation.state === 'paused') check(retained.state === 'paused' && retained.time === animation.time, `${old.id} 暂停动画进度改变`);
          else if (animation.state === 'finished') check(retained.state === 'finished' && retained.time === animation.time, `${old.id} 填充终态丢失`);
          else check(retained.state === 'running' && retained.time >= animation.time, `${old.id}/${animation.name} 无限动画从零重启`);
        }
      }
    }
    send('event-batch', { records: [{ method: 'onUpdateTranslation', payload: { id: 'legacy-c', translation: '译文更新' } }], presentation: presentation(order) });
    await settle();
    const updated = [...ids, 'legacy-d'].map(record).map(value => value.payload.id === 'legacy-a'
      ? { ...value, payload: { ...value.payload, content: 'legacy 正文更新' } } : value);
    send('hydrate', { records: updated, presentation: presentation(order) });
    await waitOrder(order);
    check(rows().find(row => row.dataset.compatibleEventId === 'legacy-a').textContent.includes('legacy 正文更新'), 'legacy 正文更新未显示');
    const survivors = snapshot().filter(row => row.id !== 'legacy-c');
    send('presentation', { ...presentation(order), layout: order.map(eventId => ({ kind: 'source', eventId, removing: eventId === 'legacy-c' })) });
    await settle();
    const remaining = order.filter(id => id !== 'legacy-c');
    send('event-batch', { records: [{ method: 'onDelSuperChat', payload: { ids: ['legacy-c'] } }], presentation: presentation(remaining) });
    await waitOrder(remaining);
    const afterDelete = snapshot();
    snapshots.push({ phase: 'updated-and-deleted', rows: afterDelete.map(({ node, ...value }) => value) });
    for (const previous of survivors) check(afterDelete.find(row => row.id === previous.id)?.node === previous.node, 'legacy 更新删除替换了保留节点');
    for (const id of order) check(starts.filter(event => event.id === id && event.name === 'legacy-entry').length === baselineEntryCounts[id], `${id} legacy 更新删除重复进场`);
    return { moveBefore: typeof items.moveBefore, appendReads, oldEntryReplays: 0, newEntryCount: baselineEntryCounts['legacy-d'], updatePreserved: true, deletionPreserved: true,
      identitiesPreserved: true, infiniteProgressPreserved: true, pausedProgressPreserved: true, filledEndPreserved: true, starts, snapshots };
  } finally {
    Element.prototype.getAnimations = nativeGetAnimations;
    document.removeEventListener('animationstart', onStart, true);
  }
}
