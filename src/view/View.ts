import { ElementProperties, Engine, UpdateViewOptions } from '../engine';
import {
  ImageElement,
  Element,
  ImageElementTransitionOptions,
  TextElement,
  AudioElement,
} from './Element';
import { resolveElementValue } from './ElementResolvedProperties';
import { Ticker } from './Ticker';

export class ViewError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class View {
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
  private visualTicker = new Ticker();
  private auralTicker = new Ticker();

  private resolveUpdate: ((value: boolean) => void) | undefined;

  constructor(
    readonly rootElement: HTMLElement,
    readonly engine: Engine,
  ) {
    engine.viewUpdater = options => this.update(options);

    rootElement.style.position = 'relative';
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

    this.visualTicker.start();
    this.auralTicker.start();
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
              this.visualTicker,
              false,
            );
            break;
          case 'text':
            element = new TextElement(
              this.engine.package_,
              this.dialogueTextElement,
              this.visualTicker,
              true,
            );
            break;
          case 'choice':
            // TODO
            continue;
          case 'background':
            element = new ImageElement(
              this.engine.package_,
              this.backgroundElement,
              this.visualTicker,
            );
            break;
          case 'figure':
            element = new ImageElement(
              this.engine.package_,
              this.figureElement,
              this.visualTicker,
            );
            break;
          case 'foreground':
            element = new ImageElement(
              this.engine.package_,
              this.foregroundElement,
              this.visualTicker,
            );
            break;
          case 'avatar':
            element = new ImageElement(
              this.engine.package_,
              this.dialogueAvatarElement,
              this.visualTicker,
            );
            break;
          case 'music':
          case 'sound':
          case 'voice':
            element = new AudioElement(this.engine.package_, this.auralTicker);
            break;
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
            Array.from(this.elements.entries()).map(([elementName, element]) =>
              element.wait(
                options.elementPropertyMatcher.getPropertyMatcher(elementName),
              ),
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
    this.rootElement.innerHTML = '';

    this.visualTicker.stop();
    this.auralTicker.stop();
  }
}
