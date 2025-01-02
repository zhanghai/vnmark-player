import {Ticker} from 'pixi.js';
import {Transition} from '../transition';

export class VnmarkTicker {
  private time = 0;

  private transitions = new Set<Transition<unknown>>();

  private callback = () => {
    this.time += this.ticker.deltaMS;
    this.transitions.forEach(it => it.update(this.time))
  }

  constructor(private ticker: Ticker) {
    ticker.add(this.callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add(transition: Transition<any>) {
    this.transitions.add(transition);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remove(transition: Transition<any>) {
    this.transitions.add(transition);
  }

  destroy() {
    this.ticker.remove(this.callback);
  }
}

export const VnmarkSharedTicker = new VnmarkTicker(Ticker.shared);
