type Clock = { now(): number; setTimeout(callback: () => void, delay: number): unknown; clearTimeout(timer: any): void };
/** 每次只安排下一个周期；取消后的回调不能进入下一轮。 */
export function createStylePreviewPlayback(next: (sequence: number) => void, clock: Clock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: timer => globalThis.clearTimeout(timer),
}) {
  let timer: unknown, generation = 0, sequence = 0, running = false, speed = 1, nextAt = 0;
  const cancel = () => { generation++; clock.clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    const epoch = generation;
    timer = clock.setTimeout(() => {
      if (!running || epoch !== generation) return;
      next(++sequence);
      if (running && epoch === generation) {
        const interval = 1000 / speed;
        nextAt += interval;
        const now = clock.now();
        if (nextAt <= now) nextAt += (Math.floor((now - nextAt) / interval) + 1) * interval;
        schedule();
      }
    }, Math.max(0, nextAt - clock.now()));
  };
  return {
    start(value: number) { cancel(); speed = value; running = true; sequence = 0; nextAt = clock.now() + 1000 / speed; schedule(); },
    setSpeed(value: number) { speed = value; cancel(); if (running) { nextAt = clock.now() + 1000 / speed; schedule(); } },
    stop() { running = false; cancel(); },
  };
}
