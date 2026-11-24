import { managedStickyRecords, runMotionCase } from '../../../blivechat/runtime/tests/motion.browser.mjs';
export async function runOpenLiveCase(options) {
  const until = Date.now() + 6000;
  while (document.readyState !== 'complete' || !document.querySelector('yt-live-chat-renderer')?.__vue__) {
    if (Date.now() > until) throw Error('开放版文档未完成启动');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return runMotionCase({ ...options, channel: 'bb-openlive' });
}
export async function runOpenLiveStream() {
  const rows = () => [...document.querySelectorAll('#chat-items > [data-compatible-event-id]')];
  const initial = rows().map(node => node.dataset.compatibleEventId);
  const references = new Map(rows().map(node => [node.dataset.compatibleEventId, node]));
  const enters = {}, sourceStarts = {}, transitions = {}, sent = [], samples = [];
  const round = Date.now();
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = (command, data) => postMessage({ type: 'bb-openlive', command, data }, location.origin);
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
