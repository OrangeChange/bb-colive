export type PlaybackControl = "pause" | "resume" | "skip" | "stop";
export type PlaybackWait = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

const waitForTimer: PlaybackWait = (milliseconds, signal) => new Promise((resolve) => {
  const timer = setTimeout(done, milliseconds);
  function done() {
    clearTimeout(timer);
    signal?.removeEventListener("abort", done);
    resolve();
  }
  signal?.addEventListener("abort", done, { once: true });
});

/** 一个事件从准备到播放结束的暂停、取消与完成信号。 */
export class PlaybackSession {
  paused = false;
  cancelled = false;
  private listeners = new Set<(control: PlaybackControl) => void>();
  private finish!: () => void;
  private abort!: () => void;
  readonly finished = new Promise<void>((resolve) => { this.finish = resolve; });
  private aborted = new Promise<null>((resolve) => { this.abort = () => resolve(null); });
  private now: () => number;
  private timer: PlaybackWait;

  constructor(now: () => number = Date.now, wait: PlaybackWait = waitForTimer) {
    this.now = now;
    this.timer = wait;
  }

  onControl(listener: (control: PlaybackControl) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  control(control: PlaybackControl): void {
    if (this.cancelled) return;
    if (control === "pause") this.paused = true;
    else if (control === "resume") this.paused = false;
    else {
      this.cancelled = true;
      this.abort();
      this.finish();
    }
    for (const listener of this.listeners) listener(control);
  }

  complete(): void { this.finish(); }

  async ready(): Promise<boolean> {
    while (this.paused && !this.cancelled) {
      await new Promise<void>((resolve) => {
        const off = this.onControl(() => { off(); resolve(); });
      });
    }
    return !this.cancelled;
  }

  async run<T>(work: Promise<T>): Promise<{ value: T } | null> {
    return Promise.race([work.then((value) => ({ value })), this.aborted]);
  }

  async wait(milliseconds: number): Promise<boolean> {
    let remaining = milliseconds;
    while (remaining > 0 && await this.ready()) {
      const startedAt = this.now();
      const timer = new AbortController();
      let off = () => {};
      let elapsed = 0;
      const changed = new Promise<false>((resolve) => {
        off = this.onControl(() => {
          elapsed = this.now() - startedAt;
          resolve(false);
        });
      });
      const completed = await Promise.race([this.timer(remaining, timer.signal).then(() => true), changed]);
      off();
      timer.abort();
      remaining = completed ? 0 : Math.max(0, remaining - elapsed);
    }
    return this.ready();
  }
}
