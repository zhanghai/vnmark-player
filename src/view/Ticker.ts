export type TickerCallback = (time: number) => void;

export class Ticker {
  public time = 0;

  private lastTimestamp: DOMHighResTimeStamp | undefined;
  private requestId: number | undefined;

  private readonly callbacks = new Map<unknown, TickerCallback>();

  start() {
    if (this.isStarted) {
      return;
    }
    this.lastTimestamp = document.timeline.currentTime as DOMHighResTimeStamp;
    if (this.callbacks.size) {
      this.resume();
    }
  }

  stop() {
    if (!this.isStarted) {
      return;
    }
    this.pause();
    this.lastTimestamp = undefined;
  }

  get isStarted(): boolean {
    return this.lastTimestamp !== undefined;
  }

  pause() {
    if (!this.isResumed) {
      return;
    }
    cancelAnimationFrame(this.requestId!);
    this.requestId = undefined;
  }

  resume() {
    if (this.isResumed) {
      return;
    }
    this.requestId = requestAnimationFrame(it => this.update(it));
  }

  get isResumed(): boolean {
    return this.requestId !== undefined;
  }

  addCallback(callbackId: unknown, callback: TickerCallback) {
    this.callbacks.set(callbackId, callback);
    if (this.callbacks.size) {
      this.resume();
    }
  }

  removeCallback(callbackId: unknown) {
    this.callbacks.delete(callbackId);
    if (!this.callbacks.size) {
      this.pause();
    }
  }

  private update(timestamp: DOMHighResTimeStamp) {
    this.time += Math.max(0, timestamp - this.lastTimestamp!);
    this.lastTimestamp = timestamp;
    this.requestId = requestAnimationFrame(it => this.update(it));
    this.callbacks.forEach(it => it(timestamp));
  }
}
