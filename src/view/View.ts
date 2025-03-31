import DOMPurity from 'dompurify';
import { MultiMap } from 'mnemonist';

import {
  ElementProperties,
  ElementType,
  Engine,
  UpdateViewOptions,
} from '../engine';
import { HTMLElements, Numbers } from '../util';
import {
  AudioElement,
  AvatarElementTransitionOptions,
  ChoiceElement,
  Element,
  FigureElementTransitionOptions,
  ImageElement,
  TextElement,
  VideoElement,
} from './Element';
import { resolveElementValue } from './ElementResolvedProperties';
import { Layout } from './Layout';
import { Ticker } from './Ticker';

export class ViewError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class View {
  private layout!: Layout;
  private readonly elements = new Map<
    string,
    Element<ElementProperties, unknown>
  >();
  private readonly typeElementNames = new MultiMap<ElementType, string>();
  private readonly visualTicker = new Ticker();
  private readonly auralTicker = new Ticker();

  private onContinue: (() => void) | undefined;
  private onSkip: (() => void) | undefined;
  private onChoose: ((script: string) => void) | undefined;

  private skippedLastWait: boolean = false;
  private isSkipping: boolean = false;

  constructor(
    private readonly rootElement: HTMLElement,
    private readonly engine: Engine,
  ) {}

  async init() {
    await this.loadTemplate();

    this.layout = new Layout(this.rootElement, this.visualTicker);
    this.layout.pointerElement.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.onClick();
    });
    this.layout.pointerElement.addEventListener('wheel', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY > 0) {
        this.onClick();
      }
    });
    document.addEventListener('keydown', event => {
      if (
        event.key === 'Enter' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.onClick();
      } else if (
        event.key === 'Control' &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.isSkipping = true;
        this.onClick();
      }
    });
    document.addEventListener('keyup', event => {
      if (event.key === 'Control') {
        event.preventDefault();
        event.stopPropagation();
        this.isSkipping = false;
      }
    });

    this.visualTicker.start();
    this.auralTicker.start();

    this.engine.viewUpdater = options => this.update(options);
  }

  private async loadTemplate() {
    const package_ = this.engine.package_;
    const template = await (
      await package_.getBlob('template', package_.manifest.template)
    ).text();
    const fragment = DOMPurity.sanitize(template, {
      RETURN_DOM_FRAGMENT: true,
    });
    // Adopt document fragment to allow decoding media.
    document.adoptNode(fragment);
    const promises: Promise<void>[] = [];
    HTMLElements.forEachDescendant(fragment, element => {
      if (element instanceof HTMLImageElement) {
        const src = element.dataset.src;
        if (src) {
          promises.push(
            package_.getBlob('template', src).then(async blob => {
              const blobUrl = URL.createObjectURL(blob);
              try {
                element.src = blobUrl;
                await element.decode();
              } catch (e) {
                URL.revokeObjectURL(blobUrl);
                throw e;
              }
            }),
          );
        }
      } else if (element instanceof HTMLAudioElement) {
        const src = element.dataset.src;
        if (src) {
          promises.push(
            package_.getBlob('template', src).then(async blob => {
              const blobUrl = URL.createObjectURL(blob);
              try {
                await HTMLElements.audioDecode(element, blobUrl);
              } catch (e) {
                URL.revokeObjectURL(blobUrl);
                throw e;
              }
            }),
          );
        }
      }
      return true;
    });
    await Promise.all(promises);
    this.rootElement.appendChild(fragment);
  }

  private onClick() {
    if (this.onContinue) {
      this.onContinue();
      this.onContinue = undefined;
    } else if (this.onSkip) {
      this.skippedLastWait = true;
      this.onSkip();
      this.onSkip = undefined;
    }
  }

  private onChoiceClick(script: string) {
    if (this.onChoose) {
      this.onChoose(script);
      this.onChoose = undefined;
    }
  }

  private waitOrSkip(
    promise: Promise<void>,
    keepSkipping: boolean = false,
  ): Promise<void> {
    if (
      this.isSkipping ||
      (this.skippedLastWait &&
        (keepSkipping || this.engine.state.keepSkippingWait))
    ) {
      return Promise.resolve();
    }
    this.skippedLastWait = false;
    return Promise.race([
      promise,
      new Promise<void>(resolve => {
        this.onSkip = resolve;
      }),
    ]);
  }

  async update(options: UpdateViewOptions): Promise<boolean> {
    const state = this.engine.state;
    const layoutName = state.layoutName;
    const elementPropertiesMap = state.elements;

    const elementNames = Object.keys(elementPropertiesMap).sort(
      (left, right) => {
        const leftElementProperties = elementPropertiesMap[left];
        const rightElementProperties = elementPropertiesMap[right];
        if (leftElementProperties.type < rightElementProperties.type) {
          return -1;
        } else if (leftElementProperties.type > rightElementProperties.type) {
          return 1;
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
        const containerElement = this.layout.getContainerElement(
          layoutName,
          elementType,
        );
        const templateElement = this.layout.getTemplateElement(
          layoutName,
          elementType,
        );
        switch (elementType) {
          case 'name':
          case 'text':
            if (containerElement) {
              element = new TextElement(
                this.engine.package_,
                containerElement,
                elementProperties.index,
                this.visualTicker,
                elementType === 'text',
              );
            }
            break;
          case 'choice':
            if (containerElement) {
              if (!templateElement) {
                throw new ViewError('Missing choice template element');
              }
              element = new ChoiceElement(
                this.engine.package_,
                containerElement,
                elementProperties.index,
                templateElement,
                it => this.onChoiceClick(it),
                this.visualTicker,
              );
            }
            break;
          case 'background':
          case 'figure':
          case 'foreground':
          case 'avatar':
            if (containerElement) {
              element = new ImageElement(
                this.engine.package_,
                containerElement,
                elementProperties.index,
                this.visualTicker,
              );
            }
            break;
          case 'music':
          case 'sound':
          case 'voice':
            element = new AudioElement(this.engine.package_, this.auralTicker);
            break;
          case 'video':
            if (containerElement) {
              element = new VideoElement(
                this.engine.package_,
                containerElement,
                elementProperties.index,
                this.visualTicker,
              );
            }
            break;
          case 'effect':
            // TODO
            break;
        }
        if (element) {
          this.elements.set(elementName, element);
          this.typeElementNames.set(elementType, elementName);
        }
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
        case 'avatar': {
          const containerElement = this.layout.getContainerElement(
            layoutName,
            elementType,
          )!;
          transitionOptions = {
            avatarPositionX: Numbers.parseFloatOrThrow(
              containerElement.dataset.positionX!,
              ViewError,
            ),
            avatarPositionY: Numbers.parseFloatOrThrow(
              containerElement.dataset.positionY!,
              ViewError,
            ),
          } satisfies AvatarElementTransitionOptions;
        }
      }
      elementTransitionGenerators.push(
        element.transition(elementProperties, transitionOptions),
      );
    }

    const elementTransitionPromises = elementTransitionGenerators.map(
      it => it.next().value,
    );
    elementTransitionPromises.forEach(it => {
      if (!(it instanceof Promise)) {
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

    switch (options.type) {
      case 'pause': {
        const hasChoice = Object.values(elementPropertiesMap).some(
          it => it.type === 'choice' && resolveElementValue(it),
        );
        if (!hasChoice && this.isSkipping) {
          return true;
        }
        return new Promise<void>(resolve => {
          if (hasChoice) {
            this.onChoose = script => {
              this.engine.evaluateScript(script);
              resolve();
            };
          } else {
            this.onContinue = resolve;
          }
        }).then(() => true);
      }
      case 'set_layout': {
        const newLayoutName = options.layoutName;
        this.engine.setLayout(newLayoutName);
        const layoutTransitionGenerator = this.layout.transition(newLayoutName);
        const exitElementTypes = layoutTransitionGenerator.next()
          .value as ElementType[];
        return this.waitOrSkip(this.layout.wait())
          .then(() => {
            this.layout.snap();
            for (const elementType of exitElementTypes) {
              const elementNames = this.typeElementNames.get(elementType) ?? [];
              for (const elementName of elementNames) {
                this.engine.removeElement(elementName);
                const element = this.elements.get(elementName)!;
                element.destroy();
                this.elements.delete(elementName);
              }
              this.typeElementNames.delete(elementType);
            }
            layoutTransitionGenerator.next();
          })
          .then(() => this.waitOrSkip(this.layout.wait(), true))
          .then(() => {
            this.layout.snap();
          })
          .then(() => true);
      }
      case 'delay': {
        return this.waitOrSkip(
          new Promise<void>(resolve =>
            setTimeout(() => resolve(), options.durationMillis),
          ),
        ).then(() => true);
      }
      case 'snap':
        for (const [elementName, element] of this.elements) {
          element.snap(
            options.elementPropertyMatcher.getPropertyMatcher(elementName),
          );
        }
        return true;
      case 'wait':
        return this.waitOrSkip(
          Promise.all(
            Array.from(this.elements).map(([elementName, element]) =>
              element.wait(
                options.elementPropertyMatcher.getPropertyMatcher(elementName),
              ),
            ),
          ).then(() => {}),
        ).then(() => true);
      default:
        // @ts-expect-error TS2339
        throw new ViewError(`Unexpected options type ${options.type}`);
    }
  }

  destroy() {
    this.visualTicker.stop();
    this.auralTicker.stop();

    this.rootElement.innerHTML = '';
  }
}
