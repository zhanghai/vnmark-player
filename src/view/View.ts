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

  private onSkipOnce: (() => void) | undefined;

  constructor(
    private readonly rootElement: HTMLElement,
    private readonly engine: Engine,
  ) {}

  async init() {
    await this.loadTemplate();

    this.layout = new Layout(this.rootElement, this.visualTicker);
    this.layout.pointerElement.addEventListener('pointerup', event => {
      event.preventDefault();
      event.stopPropagation();
      if (this.onSkipOnce) {
        this.onSkipOnce();
        this.onSkipOnce = undefined;
      }
    });
    this.layout.pointerElement.addEventListener('wheel', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY > 0 && this.onSkipOnce) {
        this.onSkipOnce();
        this.onSkipOnce = undefined;
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
    // Adopt document fragment to allow decoding images.
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
              } finally {
                URL.revokeObjectURL(blobUrl);
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
        const layoutElement = this.layout.getElement(layoutName, elementType);
        switch (elementType) {
          case 'name':
          case 'text':
            if (layoutElement) {
              element = new TextElement(
                this.engine.package_,
                layoutElement,
                elementProperties.index,
                this.visualTicker,
                elementType === 'text',
              );
            }
            break;
          case 'choice':
            // TODO
            break;
          case 'background':
          case 'figure':
          case 'foreground':
          case 'avatar':
            if (layoutElement) {
              element = new ImageElement(
                this.engine.package_,
                layoutElement,
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
            if (layoutElement) {
              element = new VideoElement(
                this.engine.package_,
                layoutElement,
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
          const layoutElement = this.layout.getElement(
            layoutName,
            elementType,
          )!;
          transitionOptions = {
            avatarPositionX: Numbers.parseFloatOrThrow(
              layoutElement.dataset.positionX!,
            ),
            avatarPositionY: Numbers.parseFloatOrThrow(
              layoutElement.dataset.positionY!,
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

    // TODO: Skip wait if interrupted until continued.
    switch (options.type) {
      case 'pause':
        return new Promise<void>(resolve => {
          this.onSkipOnce = resolve;
        }).then(() => true);
      case 'set_layout': {
        const newLayoutName = options.layoutName;
        this.engine.setLayout(newLayoutName);
        const layoutTransitionGenerator = this.layout.transition(newLayoutName);
        const exitElementTypes = layoutTransitionGenerator.next()
          .value as ElementType[];
        return Promise.race([
          this.layout.wait(),
          new Promise<void>(resolve => {
            this.onSkipOnce = resolve;
          }),
        ])
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
          .then(() =>
            Promise.race([
              this.layout.wait(),
              new Promise<void>(resolve => {
                this.onSkipOnce = resolve;
              }),
            ]),
          )
          .then(() => {
            this.layout.snap();
          })
          .then(() => true);
      }
      case 'sleep': {
        return Promise.race([
          new Promise<void>(resolve =>
            setTimeout(() => resolve(), options.durationMillis),
          ),
          new Promise<void>(resolve => {
            this.onSkipOnce = resolve;
          }),
        ]).then(() => true);
      }
      case 'snap':
        for (const [elementName, element] of this.elements) {
          element.snap(
            options.elementPropertyMatcher.getPropertyMatcher(elementName),
          );
        }
        return true;
      case 'wait':
        return Promise.race([
          Promise.all(
            Array.from(this.elements).map(([elementName, element]) =>
              element.wait(
                options.elementPropertyMatcher.getPropertyMatcher(elementName),
              ),
            ),
          ),
          new Promise<void>(resolve => {
            this.onSkipOnce = resolve;
          }),
        ]).then(() => true);
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
