import {Application} from 'pixi.js';
import {
  VnmarkElementProperties,
  VnmarkEngine,
  VnmarkState,
  VnmarkUpdateViewOptions,
} from '../vnmark-engine';
import {VnmarkManifest} from '../vnmark-package';
import {resolveVnmarkElementValue} from './VnmarkElementResolvedProperties';
import {
  VnmarkElement,
  VnmarkImageElement,
  VnmarkImageElementTransitionOptions,
} from './VnmarkElement';

export class VnmarkViewError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

// const ELEMENT_STATE_DEFAULTS_ARRAY: VnmarkElementStateDefaults[] = [
//   {
//     type: 'background',
//     value: 'none',
//     transitionDuration: {value: 1000, unit: 'ms'},
//     anchorX: {value: 0, unit: ''},
//     anchorY: {value: 0, unit: ''},
//     positionX: {value: 0, unit: ''},
//     positionY: {value: 0, unit: ''},
//     offsetX: {value: 0, unit: ''},
//     offsetY: {value: 0, unit: ''},
//     scaleX: {value: 1, unit: ''},
//     scaleY: {value: 1, unit: ''},
//     skewX: {value: 0, unit: ''},
//     skewY: {value: 0, unit: ''},
//     pivotX: {value: 50, unit: '%'},
//     pivotY: {value: 50, unit: '%'},
//     rotation: {value: 0, unit: ''},
//     alpha: {value: 1, unit: ''},
//   },
//   {
//     type: 'foreground',
//     value: 'none',
//     transitionDuration: {value: 500, unit: 'ms'},
//     anchorX: {value: 0, unit: ''},
//     anchorY: {value: 0, unit: ''},
//     positionX: {value: 0, unit: ''},
//     positionY: {value: 0, unit: ''},
//     offsetX: {value: 0, unit: ''},
//     offsetY: {value: 0, unit: ''},
//     scaleX: {value: 1, unit: ''},
//     scaleY: {value: 1, unit: ''},
//     skewX: {value: 0, unit: ''},
//     skewY: {value: 0, unit: ''},
//     pivotX: {value: 50, unit: '%'},
//     pivotY: {value: 50, unit: '%'},
//     rotation: {value: 0, unit: ''},
//     alpha: {value: 1, unit: ''},
//   },
//   {
//     type: 'figure',
//     value: 'none',
//     transitionDuration: {value: 500, unit: 'ms'},
//     anchorX: {value: 50, unit: '%'},
//     anchorY: {value: 100, unit: '%'},
//     positionX: {value: 50, unit: '%'},
//     positionY: {value: 100, unit: '%'},
//     offsetX: {value: 0, unit: ''},
//     offsetY: {value: 0, unit: ''},
//     scaleX: {value: 1, unit: ''},
//     scaleY: {value: 1, unit: ''},
//     skewX: {value: 0, unit: ''},
//     skewY: {value: 0, unit: ''},
//     pivotX: {value: 50, unit: '%'},
//     pivotY: {value: 50, unit: '%'},
//     rotation: {value: 0, unit: ''},
//     alpha: {value: 1, unit: ''},
//   },
//   {
//     type: 'avatar',
//     value: 'none',
//     transitionDuration: {value: 500, unit: 'ms'},
//     anchorX: {value: 0, unit: ''},
//     anchorY: {value: 0, unit: ''},
//     positionX: {value: 0, unit: ''},
//     positionY: {value: 0, unit: ''},
//     offsetX: {value: 0, unit: ''},
//     offsetY: {value: 0, unit: ''},
//     scaleX: {value: 1, unit: ''},
//     scaleY: {value: 1, unit: ''},
//     skewX: {value: 0, unit: ''},
//     skewY: {value: 0, unit: ''},
//     pivotX: {value: 50, unit: '%'},
//     pivotY: {value: 50, unit: '%'},
//     rotation: {value: 0, unit: ''},
//     alpha: {value: 1, unit: ''},
//   },
//   {
//     type: 'name',
//     value: '',
//     transitionDuration: {value: 0, unit: ''},
//   },
//   {
//     type: 'text',
//     value: '',
//     transitionDuration: {value: 0, unit: ''},
//   },
//   {
//     type: 'choice',
//     value: '',
//     transitionDuration: {value: 0, unit: ''},
//   },
//   {
//     type: 'music',
//     value: 'none',
//     volume: {value: 1, unit: ''},
//     transitionDuration: {value: 1000, unit: ''},
//   },
//   {
//     type: 'sound',
//     value: 'none',
//     volume: {value: 1, unit: ''},
//     transitionDuration: {value: 1000, unit: ''},
//   },
//   {
//     type: 'voice',
//     value: 'none',
//     volume: {value: 1, unit: ''},
//     transitionDuration: {value: 0, unit: ''},
//   },
//   {
//     type: 'video',
//     value: 'none',
//     transitionDuration: {value: 0, unit: ''},
//   },
// ];

export class VnmarkViewController {
  private rootElement!: HTMLElement;
  private pixiApplication!: Application;
  private elements = new Map<string, VnmarkElement<VnmarkElementProperties, unknown>>;
  private dialogueElement!: HTMLElement;

  private state: VnmarkState | null = null;

  private resolveUpdate: ((value: boolean) => void) | null = null;

  async mount(rootElement: HTMLElement, manifest: VnmarkManifest) {
    this.rootElement = rootElement;

    rootElement.style.position = 'relative';
    const pixiApplication = new Application();
    await pixiApplication.init({sharedTicker: true});
    const canvas = pixiApplication.canvas;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.objectFit = 'contain';
    rootElement.appendChild(canvas);
    // Not setting resolution in Pixi.js because we need to handle it manually for elements outside
    // Pixi.js anyway.
    pixiApplication.renderer.resize(
      Math.round(manifest.width * manifest.density),
      Math.round(manifest.height * manifest.density)
    );
    const pixiStage = pixiApplication.stage;
    pixiStage.eventMode = 'static';
    pixiStage.hitArea = pixiApplication.screen;
    pixiStage.on('pointerup', () => {
      if (this.resolveUpdate) {
        this.resolveUpdate(true);
        this.resolveUpdate = null;
      }
    });
    this.pixiApplication = pixiApplication;

    const dialogElement = document.createElement('div');
    dialogElement.style.position = 'absolute';
    rootElement.appendChild(dialogElement);
    this.dialogueElement = dialogElement;
  }

  async update(engine: VnmarkEngine, options: VnmarkUpdateViewOptions): Promise<boolean> {
    const oldState = this.state;
    const newState = engine.state;
    this.state = newState;

    const oldElementPropertiesMap = oldState?.elements ?? {};
    const newElementPropertiesMap = newState.elements;
    const elementNames =
      [...new Set([...Object.keys(oldElementPropertiesMap),
        ...Object.keys(newElementPropertiesMap)])]
        .sort((left, right) => {
          const leftElementProperties =
            oldElementPropertiesMap[left] ?? newElementPropertiesMap[left];
          const rightElementProperties =
            oldElementPropertiesMap[right] ?? newElementPropertiesMap[right];
          if (leftElementProperties.type < rightElementProperties.type) {
            return -1;
          } else if (leftElementProperties.type > rightElementProperties.type) {
            return 1;
          }
          if (leftElementProperties.index === undefined
            || rightElementProperties.index === undefined) {
            return 0;
          }
          return leftElementProperties.index - rightElementProperties.index;
        });

    const figureCount =
      Object.values(newElementPropertiesMap).reduce(
        (previousValue, currentValue) =>
          currentValue.type === 'figure' && resolveVnmarkElementValue(currentValue)
            ? previousValue + 1 : previousValue,
        0
      );
    let figureIndex = 0;
    const elementTransitionGenerators = [];
    for (const elementName of elementNames) {
      const oldElementProperties = oldElementPropertiesMap[elementName];
      const newElementProperties = newElementPropertiesMap[elementName];
      const elementProperties =
        newElementProperties
        ?? {type: oldElementProperties.type, index: oldElementProperties.index};

      if (newElementProperties && newElementProperties.type === 'figure'
        && resolveVnmarkElementValue(newElementProperties)) {
        ++figureIndex;
      }
      const imageElementTransitionOptions: VnmarkImageElementTransitionOptions =
        {figureIndex, figureCount};

      let element = this.elements.get(elementName);
      if (!element && newElementProperties && resolveVnmarkElementValue(newElementProperties)) {
        switch (newElementProperties.type) {
          case "name":
          case "text":
          case "choice":
            // TODO
            continue;
          case "background":
          case "foreground":
          case "figure":
          case "avatar":
            element = new VnmarkImageElement(engine, this.pixiApplication.stage);
            break;
          case "music":
          case "sound":
          case "voice":
            // TODO
            continue;
          case "video":
            // TODO
            continue;
          case "effect":
            // TODO
            continue;
          case "layout":
            // TODO
            continue;
        }
        this.elements.set(elementName, element);
      }
      if (!element) {
        continue;
      }
      elementTransitionGenerators.push(
        element.transition(elementProperties, imageElementTransitionOptions)
      );
    }

    const elementTransitionPromises = elementTransitionGenerators.map(it => it.next().value);
    elementTransitionPromises.forEach(it => {
      if (!(it && typeof it.then === 'function')) {
        throw new VnmarkViewError(
          'Element transition didn\'t yield a promise for the first call to next()'
        );
      }
    });
    await Promise.all(elementTransitionPromises);
    elementTransitionGenerators.forEach(it => {
      if (!it.next().done) {
        throw new VnmarkViewError('Element transition isn\'t done after the second call to next()');
      }
    });

    // TODO
    this.dialogueElement.innerText = JSON.stringify(engine.state);
    switch (options.type) {
      case "pause":
        return new Promise(resolve => this.resolveUpdate = resolve);
      case "sleep": {
        return Promise.race<boolean>([
          new Promise(resolve => setTimeout(() => resolve(true), options.durationMillis)),
          new Promise(resolve => this.resolveUpdate = resolve),
        ]);
      }
      case "snap":
        // TODO
        return true;
      case "wait":
        // TODO
        engine.state.elements.toString();
        return Promise.race<boolean>([
          // TODO
          new Promise(resolve => setTimeout(() => resolve(true), 500)),
          new Promise(resolve => this.resolveUpdate = resolve),
        ]);
      default:
        // @ts-expect-error TS2339
        throw new VnmarkViewError(`Unexpected options type ${options.type}`);
    }
  }

  async unmount() {
    this.pixiApplication.destroy(true, true);
    this.rootElement.textContent = '';
  }
}
