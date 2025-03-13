import { ElementProperties, Engine, UpdateViewOptions } from '../engine';
import {
  AudioElement,
  AvatarElementTransitionOptions,
  Element,
  FigureElementTransitionOptions,
  ImageElement,
  TextElement,
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
    const dialogueAvatarElement = dialogueElement.getElementsByClassName(
      'avatar',
    )[0] as HTMLElement;
    this.dialogueAvatarElement = dialogueAvatarElement;
    const dialogueAvatarPositionX = Number.parseFloat(
      dialogueAvatarElement.dataset.positionX!,
    );
    if (Number.isNaN(dialogueAvatarPositionX)) {
      throw new ViewError('Cannot parse dialogue avatar position X');
    }
    this.dialogueAvatarPositionX = dialogueAvatarPositionX;
    const dialogueAvatarPositionY = Number.parseFloat(
      dialogueAvatarElement.dataset.positionY!,
    );
    if (Number.isNaN(dialogueAvatarPositionY)) {
      throw new ViewError('Cannot parse dialogue avatar position Y');
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
    const elementIndices: Record<string, number> = {};
    const elementTypeCounts: Record<string, number> = {};
    for (const elementName of elementNames) {
      const elementProperties = elementPropertiesMap[elementName]!;
      if (!resolveElementValue(elementProperties)) {
        continue;
      }
      const elementType = elementProperties.type;
      let elementTypeCount = elementTypeCounts[elementType] ?? 0;
      elementIndices[elementName] = elementTypeCount;
      ++elementTypeCount;
      elementTypeCounts[elementType] = elementTypeCount;
    }

    const elementTransitionGenerators = [];
    for (const elementName of elementNames) {
      const elementProperties = elementPropertiesMap[elementName]!;

      let element = this.elements.get(elementName);
      const elementType = elementProperties.type;
      if (!element && resolveElementValue(elementProperties)) {
        switch (elementType) {
          case 'name':
            element = new TextElement(
              this.engine.package_,
              this.dialogueNameElement,
              elementProperties.index!,
              this.visualTicker,
              false,
            );
            break;
          case 'text':
            element = new TextElement(
              this.engine.package_,
              this.dialogueTextElement,
              elementProperties.index!,
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
              elementProperties.index!,
              this.visualTicker,
            );
            break;
          case 'figure':
            element = new ImageElement(
              this.engine.package_,
              this.figureElement,
              elementProperties.index!,
              this.visualTicker,
            );
            break;
          case 'foreground':
            element = new ImageElement(
              this.engine.package_,
              this.foregroundElement,
              elementProperties.index!,
              this.visualTicker,
            );
            break;
          case 'avatar':
            element = new ImageElement(
              this.engine.package_,
              this.dialogueAvatarElement,
              elementProperties.index!,
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

      let transitionOptions: unknown;
      switch (elementType) {
        case 'figure':
          transitionOptions = {
            figureIndex: elementIndices[elementName],
            figureCount: elementTypeCounts[elementType],
          } satisfies FigureElementTransitionOptions;
          break;
        case 'avatar':
          transitionOptions = {
            avatarPositionX: this.dialogueAvatarPositionX,
            avatarPositionY: this.dialogueAvatarPositionY,
          } satisfies AvatarElementTransitionOptions;
      }
      elementTransitionGenerators.push(
        element.transition(elementProperties, transitionOptions),
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
