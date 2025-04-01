import { HTMLElements } from '../util';
import { VideoElementResolvedProperties } from './ElementResolvedProperties';
import { ViewError } from './View';

export class VideoObject {
  readonly element: HTMLVideoElement;

  private _value = 1;
  private _propertyAlpha = 1;
  private _propertyVolume = 1;

  constructor() {
    this.element = document.createElement('video');
    this.element.style.objectFit = 'contain';
  }

  load(url: string): Promise<void> {
    if (this.element.src) {
      throw new ViewError('Cannot reload a video object');
    }
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const signal = abortController.signal;
      this.element.addEventListener(
        'canplay',
        () => {
          abortController.abort();
          resolve();
        },
        { signal },
      );
      this.element.addEventListener(
        'error',
        event => {
          abortController.abort();
          reject(event);
        },
        { signal },
      );
      this.element.src = url;
    });
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this._value = value;
    this.updateOpacity();
    this.updateVolume();
  }

  get propertyAlpha(): number {
    return this._propertyAlpha;
  }

  set propertyAlpha(value: number) {
    this._propertyAlpha = value;
    this.updateOpacity();
  }

  private updateOpacity() {
    HTMLElements.setOpacity(this.element, this._value * this._propertyAlpha);
  }

  get propertyVolume(): number {
    return this._propertyVolume;
  }

  set propertyVolume(value: number) {
    this._propertyVolume = value;
    this.updateVolume();
  }

  private updateVolume() {
    this.element.volume = this._value * this._propertyVolume;
  }

  get loop(): boolean {
    return this.element.loop;
  }

  set loop(value: boolean) {
    this.element.loop = value;
  }

  getPropertyValue(
    propertyName: keyof VideoElementResolvedProperties,
  ): VideoElementResolvedProperties[typeof propertyName] {
    switch (propertyName) {
      case 'value':
        return this.value;
      case 'alpha':
        return this.propertyAlpha;
      case 'volume':
        return this.propertyVolume;
      case 'loop':
        return this.loop;
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }

  setPropertyValue(
    propertyName: keyof VideoElementResolvedProperties,
    propertyValue: VideoElementResolvedProperties[typeof propertyName],
  ) {
    switch (propertyName) {
      case 'value':
        this.value =
          propertyValue as VideoElementResolvedProperties[typeof propertyName];
        break;
      case 'alpha':
        this.propertyAlpha =
          propertyValue as VideoElementResolvedProperties[typeof propertyName];
        break;
      case 'volume':
        this.propertyVolume =
          propertyValue as VideoElementResolvedProperties[typeof propertyName];
        break;
      case 'loop':
        this.loop =
          propertyValue as VideoElementResolvedProperties[typeof propertyName];
        break;
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }

  createPlaybackPromise(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.element.loop || this.element.ended) {
        resolve();
        return;
      }
      const abortController = new AbortController();
      const signal = abortController.signal;
      this.element.addEventListener(
        'ended',
        () => {
          abortController.abort();
          resolve();
        },
        { signal },
      );
      this.element.addEventListener(
        'error',
        event => {
          abortController.abort();
          reject(event);
        },
        { signal },
      );
    });
  }
}
