/** 预览生产端记录实际回调，接收端显示同一份已呈现数据。 */
export function observePreviewRuntime(
  runtime,
  publish,
  schedule = queueMicrotask,
) {
  let enabled = false,
    epoch = 0,
    sequence = 0,
    records = [],
    pending = false;
  const send = () => {
    if (!enabled || pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      if (enabled) publish({ epoch, records: records.slice() });
    });
  };
  const receive = runtime.receive.bind(runtime),
    reset = runtime.reset.bind(runtime);
  runtime.receive = (input) => {
    if (!enabled) return receive(input);
    const record = {
      ...input,
      sequence: ++sequence,
      payload: {
        ...(input.payload ?? input.data),
        id: (input.payload ?? input.data)?.id ?? `preview:${epoch}:${sequence}`,
      },
    };
    records.push(record);
    records = records.slice(-(runtime.retention?.maxCallbacks ?? 2000));
    const result = receive(record);
    Promise.resolve(result).then(send);
    return result;
  };
  runtime.reset = (...args) => {
    const result = reset(...args);
    epoch++;
    records = [];
    send();
    return result;
  };
  return (value) => {
    enabled = value === true;
    if (enabled) send();
  };
}

const presentationRounds = new WeakMap();

function reconcileMessages(current, incoming) {
  const byId = new Map(current.map(message => [message.id, message]));
  const next = incoming.map(message => {
    const previous = byId.get(message.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(message)) return previous;
    return {
      ...message,
      ...(message.time !== undefined ? { time: new Date(message.time) } : {}),
      ...(message.addTime !== undefined ? { addTime: new Date(message.addTime) } : {}),
    };
  });
  const retained = new Set(next);
  let changed = false;
  for (let index = 0; index < next.length; index++) {
    if (current[index] === next[index]) continue;
    const existing = current.indexOf(next[index], index + 1);
    if (existing !== -1) {
      current.splice(index, 0, current.splice(existing, 1)[0]);
    } else if (index < current.length && !retained.has(current[index])) {
      current.splice(index, 1, next[index]);
    } else {
      current.splice(index, 0, next[index]);
    }
    changed = true;
  }
  if (current.length > next.length) {
    current.splice(next.length);
    changed = true;
  }
  return changed;
}

export function applyPreviewPresentation(renderer, data, previewWindow) {
  previewWindow?.cancel();
  const previous = presentationRounds.get(renderer);
  const initialized = previous !== undefined;
  const restarted = initialized && previous.restart !== data.restart;
  const advanced = initialized && data.epoch !== undefined && previous.epoch !== undefined && data.epoch > previous.epoch;
  let initializing = initialized && previous.initializing;
  if (initialized && data.epoch !== undefined && previous.epoch !== undefined && data.epoch < previous.epoch) initializing = true;
  if (restarted && data.epoch === 0) initializing = true;
  const reset = !initialized || restarted || (advanced && !initializing);
  if (advanced) initializing = false;
  presentationRounds.set(renderer, { restart: data.restart, epoch: data.epoch, initializing });
  if (reset) {
    if (renderer.emitSmoothedMessageTimerId != null)
      clearTimeout(renderer.emitSmoothedMessageTimerId);
    renderer.emitSmoothedMessageTimerId = null;
    renderer.smoothedMessageQueue = [];
    renderer.messagesBuffer = [];
    renderer.resetSmoothScroll();
    if (initialized) {
      renderer.messages?.splice(0);
      renderer.paidMessages?.splice(0);
    }
  }
  renderer.messages ??= [];
  renderer.paidMessages ??= [];
  const messagesChanged = reconcileMessages(renderer.messages, data.messages);
  const paidChanged = reconcileMessages(renderer.paidMessages, data.paidMessages);
  return reset || messagesChanged || paidChanged;
}
