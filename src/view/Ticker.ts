export type TickerCallback = (time: number) => void;

export class Ticker {
  public time = 0;

  private lastTimestamp: DOMHighResTimeStamp | undefined;
  private requestId: number | undefined;

  private readonly callbacks = new Map<unknown, TickerCallback>();

  start() {
    this.lastTimestamp = document.timeline.currentTime as DOMHighResTimeStamp;
    this.requestId = requestAnimationFrame(it => this.update(it));
  }

  private update(timestamp: DOMHighResTimeStamp) {
    this.time += Math.max(0, timestamp - this.lastTimestamp!);
    this.lastTimestamp = timestamp;
    this.requestId = requestAnimationFrame(it => this.update(it));
    this.callbacks.forEach(it => it(timestamp));
  }

  stop() {
    if (this.requestId !== undefined) {
      cancelAnimationFrame(this.requestId);
    }
    this.lastTimestamp = undefined;
  }

  get isRunning(): boolean {
    return this.requestId !== undefined;
  }

  addCallback(callbackId: unknown, callback: TickerCallback) {
    this.callbacks.set(callbackId, callback);
  }

  removeCallback(callbackId: unknown) {
    this.callbacks.delete(callbackId);
  }
}
