import { Howl } from 'howler';

import { AudioElementResolvedProperties } from './ElementResolvedProperties';
import { ViewError } from './View';

export class AudioObject {
  public howl!: Howl;

  private _valueVolume = 1;
  private _propertyVolume = 1;
  private _volume = 1;
  private _loop = false;

  load(url: string): Promise<void> {
    if (this.howl) {
      throw new ViewError('Cannot reload an audio object');
    }
    const howl = new Howl({
      src: url,
      // The format here is only needed to workaround Howl.
      format: 'mp3',
      preload: false,
    });
    const promise = new Promise<void>((resolve, reject) => {
      howl
        .once('load', () => {
          howl.off('loaderror');
          resolve();
        })
        .once('loaderror', (_, error) => {
          howl.off('load');
          reject(error);
        });
    });
    this.howl = howl;
    howl.load();
    return promise;
  }

  get valueVolume(): number {
    return this._valueVolume;
  }

  set valueVolume(value: number) {
    this._valueVolume = value;
    this.updateVolume();
  }

  get propertyVolume(): number {
    return this._propertyVolume;
  }

  set propertyVolume(value: number) {
    this._propertyVolume = value;
    this.updateVolume();
  }

  private updateVolume() {
    this.volume = this._valueVolume * this._propertyVolume;
  }

  // Howl doesn't have a quick path for unchanged volume.
  private set volume(value: number) {
    if (this._volume === value) {
      return;
    }
    this._volume = value;
    this.howl.volume(value);
  }

  get loop(): boolean {
    return this._loop;
  }

  // Howl doesn't have a quick path for unchanged loop.
  set loop(value: boolean) {
    if (this._loop === value) {
      return;
    }
    this._loop = value;
    this.howl.loop(value);
  }

  getPropertyValue(
    propertyName: keyof AudioElementResolvedProperties,
  ): AudioElementResolvedProperties[typeof propertyName] {
    switch (propertyName) {
      case 'value':
        return this.valueVolume;
      case 'volume':
        return this.propertyVolume;
      case 'loop':
        return this.howl.loop();
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }

  setPropertyValue(
    propertyName: keyof AudioElementResolvedProperties,
    propertyValue: AudioElementResolvedProperties[typeof propertyName],
  ) {
    switch (propertyName) {
      case 'value':
        this.valueVolume =
          propertyValue as AudioElementResolvedProperties[typeof propertyName];
        break;
      case 'volume':
        this.propertyVolume =
          propertyValue as AudioElementResolvedProperties[typeof propertyName];
        break;
      case 'loop':
        this.loop =
          propertyValue as AudioElementResolvedProperties[typeof propertyName];
        break;
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }

  createPlaybackPromise(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.howl.loop() || !this.howl.playing()) {
        resolve();
        return;
      }
      this.howl
        .once('stop', () => {
          this.howl.off('playerror').off('end');
          resolve();
        })
        .once('end', () => {
          this.howl.off('playerror').off('stop');
          resolve();
        })
        .once('playerror', (_, error) => {
          this.howl.off('end').off('stop');
          reject(error);
        });
    });
  }
}
