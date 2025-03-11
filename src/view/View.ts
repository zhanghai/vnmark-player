import { Application } from 'pixi.js';

import { ElementProperties, Engine, UpdateViewOptions } from '../engine';
import {
  DOMImageElement,
  Element,
  ImageElementTransitionOptions,
  TextElement,
} from './Element';
import { resolveElementValue } from './ElementResolvedProperties';

export class ViewError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class View {
  private pixiApplication!: Application;
  private backgroundElement!: HTMLElement;
  private figureElement!: HTMLElement;
  private foregroundElement!: HTMLElement;
  private dialogueElement!: HTMLElement;
  private dialogueAvatarElement!: HTMLElement;
  private dialogueAvatarPositionX!: number;
  private dialogueAvatarPositionY!: number;
  private dialogueNameElement!: HTMLElement;
  private dialogueTextElement!: HTMLElement;
  private debugElement!: HTMLElement;

  private elements = new Map<string, Element<ElementProperties, unknown>>();

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

    const canvas = rootElement.getElementsByClassName(
      'canvas',
    )[0] as HTMLCanvasElement;
    const pixiApplication = new Application();
    await pixiApplication.init({
      backgroundAlpha: 0,
      canvas,
      sharedTicker: true,
    });
    // Not setting resolution in Pixi.js because we need to handle it manually for elements outside
    // Pixi.js anyway.
    const manifest = this.engine.package_.manifest;
    pixiApplication.renderer.resize(
      Math.round(manifest.width * manifest.density),
      Math.round(manifest.height * manifest.density),
    );
    pixiApplication.stage.eventMode = 'none';
    this.pixiApplication = pixiApplication;

    this.backgroundElement = rootElement.getElementsByClassName(
      'background',
    )[0] as HTMLElement;
    this.figureElement = rootElement.getElementsByClassName(
      'figure',
    )[0] as HTMLElement;
    this.foregroundElement = rootElement.getElementsByClassName(
      'foreground',
    )[0] as HTMLElement;
    const dialogueElement = rootElement.getElementsByClassName(
      'dialogue',
    )[0] as HTMLElement;
    this.dialogueElement = dialogueElement;
    const dialogueAvatarElement = dialogueElement.getElementsByClassName(
      'avatar',
    )[0] as HTMLElement;
    this.dialogueAvatarElement = dialogueAvatarElement;
    const dialogueAvatarPaddingLeft = dialogueAvatarElement.style.paddingLeft;
    const dialogueAvatarPositionX = Number.parseFloat(
      dialogueAvatarElement.style.paddingLeft.replace(/px$/, ''),
    );
    if (Number.isNaN(dialogueAvatarPositionX)) {
      throw new ViewError(
        `Cannot parse dialogue avatar padding-left "${dialogueAvatarPaddingLeft}"`,
      );
    }
    this.dialogueAvatarPositionX = dialogueAvatarPositionX;
    const dialogueAvatarPaddingTop = dialogueAvatarElement.style.paddingTop;
    const dialogueAvatarPositionY = Number.parseFloat(
      dialogueAvatarElement.style.paddingTop.replace(/px$/, ''),
    );
    if (Number.isNaN(dialogueAvatarPositionY)) {
      throw new ViewError(
        `Cannot parse dialogue avatar padding-top "${dialogueAvatarPaddingTop}"`,
      );
    }
    this.dialogueAvatarPositionY = dialogueAvatarPositionY;
    this.dialogueNameElement = dialogueElement.getElementsByClassName(
      'name',
    )[0] as HTMLElement;
    this.dialogueTextElement = dialogueElement.getElementsByClassName(
      'text',
    )[0] as HTMLElement;

    const pointerElement = rootElement.getElementsByClassName(
      'pointer',
    )[0] as HTMLElement;
    pointerElement.addEventListener('pointerup', () => {
      if (this.resolveUpdate) {
        this.resolveUpdate(true);
        this.resolveUpdate = undefined;
      }
    });

    this.debugElement = rootElement.getElementsByClassName(
      'debug',
    )[0] as HTMLElement;
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
        avatarPositionX: this.dialogueAvatarPositionX,
        avatarPositionY: this.dialogueAvatarPositionY,
      };

      let element = this.elements.get(elementName);
      if (!element && resolveElementValue(elementProperties)) {
        switch (elementProperties.type) {
          case 'name':
            element = new TextElement(
              this.engine.package_,
              this.dialogueNameElement,
              false,
            );
            break;
          case 'text':
            element = new TextElement(
              this.engine.package_,
              this.dialogueTextElement,
              true,
            );
            break;
          case 'choice':
            // TODO
            continue;
          case 'background':
            element = new DOMImageElement(
              this.engine.package_,
              this.backgroundElement,
            );
            break;
          case 'figure':
            element = new DOMImageElement(
              this.engine.package_,
              this.figureElement,
            );
            break;
          case 'foreground':
            // Pixi.js doesn't support custom compositing operators like 'plus-lighter'.
            // https://github.com/pixijs/pixijs/issues/11324
            // element = new PixiImageElement(
            //   this.engine.package_,
            //   this.pixiApplication.stage,
            // );
            element = new DOMImageElement(
              this.engine.package_,
              this.foregroundElement,
            );
            break;
          case 'avatar':
            element = new DOMImageElement(
              this.engine.package_,
              this.dialogueAvatarElement,
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
    this.debugElement.innerText = JSON.stringify(
      newState,
      undefined,
      '    ',
    ).replace(/\n {12}( {4}|(?=}))/g, ' ');

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
        for (const [elementName, element] of this.elements.entries()) {
          element.snap(
            options.elementPropertyMatcher.getPropertyMatcher(elementName),
          );
        }
        return true;
      case 'wait':
        return Promise.race([
          Promise.all(
            Array.from(this.elements.entries()).flatMap(
              ([elementName, element]) => {
                element.wait(
                  options.elementPropertyMatcher.getPropertyMatcher(
                    elementName,
                  ),
                );
              },
            ),
          ).then(() => true),
          new Promise<boolean>(resolve => {
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
