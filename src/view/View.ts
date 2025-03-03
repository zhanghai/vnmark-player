import { Application } from 'pixi.js';
import { ElementProperties, Engine, UpdateViewOptions } from '../engine';
import { resolveElementValue } from './ElementResolvedProperties';
import {
  Element,
  ImageElement,
  ImageElementTransitionOptions,
} from './Element';

export class ViewError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class View {
  private pixiApplication!: Application;
  private elements = new Map<string, Element<ElementProperties, unknown>>();
  private dialogueElement!: HTMLElement;

  private resolveUpdate: ((value: boolean) => void) | undefined;

  constructor(
    readonly rootElement: HTMLElement,
    readonly engine: Engine,
  ) {
    engine.viewUpdater = options => this.update(options);
  }

  async init() {
    const rootElement = this.rootElement;
    rootElement.style.position = 'relative';
    const pixiApplication = new Application();
    await pixiApplication.init({ sharedTicker: true });
    const canvas = pixiApplication.canvas;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.objectFit = 'contain';
    rootElement.appendChild(canvas);
    // Not setting resolution in Pixi.js because we need to handle it manually for elements outside
    // Pixi.js anyway.
    const manifest = this.engine.package_.manifest;
    pixiApplication.renderer.resize(
      Math.round(manifest.width * manifest.density),
      Math.round(manifest.height * manifest.density),
    );
    const pixiStage = pixiApplication.stage;
    pixiStage.eventMode = 'static';
    pixiStage.hitArea = pixiApplication.screen;
    pixiStage.on('pointerup', () => {
      if (this.resolveUpdate) {
        this.resolveUpdate(true);
        this.resolveUpdate = undefined;
      }
    });
    this.pixiApplication = pixiApplication;

    const dialogElement = document.createElement('div');
    dialogElement.style.position = 'absolute';
    rootElement.appendChild(dialogElement);
    this.dialogueElement = dialogElement;
  }

  async update(options: UpdateViewOptions): Promise<boolean> {
    const elementPropertiesMap = this.engine.state.elements;
    const elementNames = Object.keys(elementPropertiesMap).sort(
      (left, right) => {
        const leftElementProperties = elementPropertiesMap[left];
        const rightElementProperties = elementPropertiesMap[right];
        if (leftElementProperties.type < rightElementProperties.type) {
          return -1;
        } else if (leftElementProperties.type > rightElementProperties.type) {
          return 1;
        }
        if (
          leftElementProperties.index === undefined ||
          rightElementProperties.index === undefined
        ) {
          return 0;
        }
        return leftElementProperties.index - rightElementProperties.index;
      },
    );

    const figureCount = Object.values(elementPropertiesMap).reduce(
      (previousValue, currentValue) =>
        currentValue.type === 'figure' && resolveElementValue(currentValue)
          ? previousValue + 1
          : previousValue,
      0,
    );
    let figureIndex = 0;
    const elementTransitionGenerators = [];
    for (const elementName of elementNames) {
      const elementProperties = elementPropertiesMap[elementName]!;

      if (
        elementProperties.type === 'figure' &&
        resolveElementValue(elementProperties)
      ) {
        ++figureIndex;
      }
      const imageElementTransitionOptions: ImageElementTransitionOptions = {
        figureIndex,
        figureCount,
      };

      let element = this.elements.get(elementName);
      if (!element && resolveElementValue(elementProperties)) {
        switch (elementProperties.type) {
          case 'name':
          case 'text':
          case 'choice':
            // TODO
            continue;
          case 'background':
          case 'foreground':
          case 'figure':
          case 'avatar':
            element = new ImageElement(
              this.engine.package_,
              this.pixiApplication.stage,
            );
            break;
          case 'music':
          case 'sound':
          case 'voice':
            // TODO
            continue;
          case 'video':
            // TODO
            continue;
          case 'effect':
            // TODO
            continue;
          case 'layout':
            // TODO
            continue;
        }
        this.elements.set(elementName, element);
      }
      if (!element) {
        continue;
      }
      elementTransitionGenerators.push(
        element.transition(elementProperties, imageElementTransitionOptions),
      );
    }

    const elementTransitionPromises = elementTransitionGenerators.map(
      it => it.next().value,
    );
    elementTransitionPromises.forEach(it => {
      if (!(it && typeof it.then === 'function')) {
        throw new ViewError(
          "Element transition didn't yield a promise for the first call to next()",
        );
      }
    });
    await Promise.all(elementTransitionPromises);
    elementTransitionGenerators.forEach(it => {
      if (!it.next().done) {
        throw new ViewError(
          "Element transition isn't done after the second call to next()",
        );
      }
    });

    // TODO
    const newState = this.engine.state;
    this.dialogueElement.innerText = JSON.stringify(newState);
    switch (options.type) {
      case 'pause':
        return new Promise(resolve => {
          this.resolveUpdate = resolve;
        });
      case 'sleep': {
        return Promise.race<boolean>([
          new Promise(resolve =>
            setTimeout(() => resolve(true), options.durationMillis),
          ),
          new Promise(resolve => {
            this.resolveUpdate = resolve;
          }),
        ]);
      }
      case 'snap':
        // TODO
        return true;
      case 'wait':
        // TODO
        newState.elements.toString();
        return Promise.race<boolean>([
          // TODO
          new Promise(resolve => setTimeout(() => resolve(true), 500)),
          new Promise(resolve => {
            this.resolveUpdate = resolve;
          }),
        ]);
      default:
        // @ts-expect-error TS2339
        throw new ViewError(`Unexpected options type ${options.type}`);
    }
  }

  async destroy() {
    this.pixiApplication.destroy(true, true);
    this.rootElement.textContent = '';
  }
}
