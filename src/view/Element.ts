import { MultiMap } from 'mnemonist';

import {
  ElementProperties,
  ImageElementProperties,
  Matcher,
  TextElementProperties,
} from '../engine';
import { Package } from '../package';
import { Transition } from '../transition';
import {
  ImageElementResolvedProperties,
  resolveElementTransitionDuration,
  resolveElementValue,
  TextElementResolvedProperties,
} from './ElementResolvedProperties';
import { ImageObject } from './ImageObject';
import { TextObject } from './TextObject';
import { Ticker } from './Ticker';

export interface Element<Properties extends ElementProperties, Options> {
  transition(
    properties: Properties,
    options: Options,
  ): Generator<Promise<unknown>, void, void>;

  wait(propertyMatcher: Matcher): Promise<void>;

  snap(propertyMatcher: Matcher): void;
}

export abstract class BaseElement<
  Object,
  Properties extends ElementProperties,
  ResolvedProperties extends Record<string, unknown>,
  Options,
> implements Element<Properties, Options>
{
  private object: Object | undefined;
  private properties: Properties | undefined;
  private options: Options | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly objectTransitions = new MultiMap<Object, Transition<any>>();
  private readonly propertyTransitions = new MultiMap<
    keyof ResolvedProperties,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Transition<any>
  >();

  protected constructor(
    private readonly ticker: Ticker,
    private readonly crossFade: boolean,
  ) {}

  *transition(
    properties: Properties,
    options: Options,
  ): Generator<Promise<unknown>, void, void> {
    const oldObject = this.object;
    const oldProperties = this.properties;
    const oldOptions = this.options;
    const newProperties = properties;
    const newOptions = options;

    const oldValue = oldProperties
      ? resolveElementValue(oldProperties)
      : undefined;
    const newValue = resolveElementValue(newProperties);
    if (!oldValue && !newValue) {
      yield Promise.resolve();
      return;
    }

    let newObject: Object | undefined;
    if (newValue && newValue !== oldValue) {
      yield this.createObject(newProperties.type, newValue).then(it => {
        newObject = it;
      });
    } else {
      yield Promise.resolve();
    }

    let oldObjectOldProperties: ResolvedProperties | undefined;
    let oldObjectNewProperties: ResolvedProperties | undefined;
    if (oldObject) {
      oldObjectOldProperties = this.resolveProperties(
        oldProperties!,
        oldObject,
        false,
        oldOptions!,
      );
      oldObjectNewProperties = this.resolveProperties(
        this.crossFade && newValue ? newProperties : oldProperties!,
        oldObject,
        oldValue !== newValue,
        this.crossFade && newValue ? newOptions : oldOptions!,
      );
    }
    let newObjectOldProperties: ResolvedProperties | undefined;
    let newObjectNewProperties: ResolvedProperties | undefined;
    if (newObject) {
      newObjectOldProperties = this.resolveProperties(
        this.crossFade && oldValue ? oldProperties! : newProperties,
        newObject,
        oldValue !== newValue,
        this.crossFade && oldValue ? oldOptions! : newOptions,
      );
      newObjectNewProperties = this.resolveProperties(
        newProperties,
        newObject,
        false,
        newOptions,
      );
    }

    if (newObject) {
      for (const [propertyName, propertyValue] of Object.entries(
        newObjectOldProperties!,
      )) {
        this.setPropertyValue(
          newObject,
          propertyName,
          propertyValue as ResolvedProperties[typeof propertyName],
        );
      }
      this.attachObject(newObject);
    }

    const oldObjectTransitionDuration = oldObject
      ? resolveElementTransitionDuration(
          newProperties,
          this.getTransitionElementCount(oldObject, false),
        )
      : 0;
    const newObjectTransitionDelay = this.crossFade
      ? 0
      : oldObjectTransitionDuration;
    const newObjectTransitionDuration = newObject
      ? resolveElementTransitionDuration(
          newProperties,
          this.getTransitionElementCount(newObject, true),
        )
      : 0;

    const propertyNames = Object.keys(
      (oldObjectOldProperties ?? newObjectNewProperties)!,
    ) as (keyof ResolvedProperties)[];
    for (const propertyName of propertyNames) {
      const oldObjectChanged =
        oldObjectOldProperties?.[propertyName] !==
        oldObjectNewProperties?.[propertyName];
      const newObjectChanged =
        newObjectOldProperties?.[propertyName] !==
        newObjectNewProperties?.[propertyName];
      if (oldObjectChanged || newObjectChanged) {
        this.propertyTransitions.get(propertyName)?.forEach(it => it.end());
      }

      if (oldObjectChanged) {
        this.transitionPropertyValue(
          oldObject!,
          propertyName,
          oldObjectNewProperties![propertyName],
          0,
          oldObjectTransitionDuration,
        );
      }
      if (newObjectChanged) {
        this.transitionPropertyValue(
          newObject!,
          propertyName,
          newObjectNewProperties![propertyName],
          newObjectTransitionDelay,
          newObjectTransitionDuration,
        );
      }
    }

    if (newValue) {
      this.object = newObject ?? oldObject;
      this.properties = newProperties;
      this.options = newOptions;
    } else {
      this.object = undefined;
      this.properties = undefined;
      this.options = undefined;
    }
  }

  protected abstract resolveProperties(
    properties: Properties,
    object: Object,
    valueChanged: boolean,
    options: Options,
  ): ResolvedProperties;

  protected abstract createObject(type: string, value: string): Promise<Object>;

  protected abstract destroyObject(object: Object): void;

  protected abstract attachObject(object: Object): void;

  protected abstract detachObject(object: Object): void;

  protected getTransitionElementCount(
    _object: Object,
    _isEnter: boolean,
  ): number {
    return 1;
  }

  protected abstract getPropertyValue(
    object: Object,
    propertyName: keyof ResolvedProperties,
  ): ResolvedProperties[typeof propertyName];

  protected abstract setPropertyValue(
    object: Object,
    propertyName: keyof ResolvedProperties,
    propertyValue: ResolvedProperties[typeof propertyName],
  ): void;

  private transitionPropertyValue(
    object: Object,
    propertyName: keyof ResolvedProperties,
    propertyValue: ResolvedProperties[typeof propertyName],
    transitionDelay: number,
    transitionDuration: number,
  ) {
    const currentPropertyValue = this.getPropertyValue(object, propertyName);
    const transition = new Transition(
      currentPropertyValue,
      propertyValue,
      transitionDuration,
    )
      .setDelay(transitionDelay)
      .addOnUpdateCallback(it =>
        this.setPropertyValue(object, propertyName, it),
      )
      .addOnEndCallback(() => {
        this.objectTransitions.remove(object, transition);
        this.propertyTransitions.remove(propertyName, transition);
        this.ticker.removeCallback(transition);
        if (propertyName === 'value' && propertyValue === 0) {
          this.objectTransitions.get(object)?.forEach(it => it.end());
          this.detachObject(object);
          this.destroyObject(object);
          // TODO: Remove this element if there's no object?
        }
      });
    this.objectTransitions.set(object, transition);
    this.propertyTransitions.set(propertyName, transition);
    this.ticker.addCallback(transition, it => transition.update(it));
    transition.start();
  }

  wait(propertyMatcher: Matcher): Promise<void> {
    return Promise.all(
      Array.from(this.propertyTransitions.entries())
        .filter(it => propertyMatcher.match(it[0] as string))
        .map(it => it[1].asPromise()),
    ).then(() => {});
  }

  snap(propertyMatcher: Matcher) {
    for (const [
      propertyName,
      transition,
    ] of this.propertyTransitions.entries()) {
      if (propertyMatcher.match(propertyName as string)) {
        transition.end();
      }
    }
  }
}

export interface ImageElementTransitionOptions {
  figureIndex: number;
  figureCount: number;
  avatarPositionX: number;
  avatarPositionY: number;
}

export class ImageElement extends BaseElement<
  ImageObject,
  ImageElementProperties,
  ImageElementResolvedProperties,
  ImageElementTransitionOptions
> {
  private readonly layer;

  constructor(
    private readonly package_: Package,
    container: HTMLElement,
    ticker: Ticker,
  ) {
    super(ticker, true);

    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.isolation = 'isolate';
    layer.style.overflow = 'hidden';
    // FIXME: Use the correct order instead of the insertion order.
    container.appendChild(layer);
    this.layer = layer;
  }

  protected resolveProperties(
    properties: ImageElementProperties,
    object: ImageObject,
    valueChanged: boolean,
    options: ImageElementTransitionOptions,
  ): ImageElementResolvedProperties {
    const manifest = this.package_.manifest;
    return ImageElementResolvedProperties.resolve(properties, {
      valueChanged,
      density: manifest.density,
      screenWidth: manifest.width,
      screenHeight: manifest.height,
      imageWidth: object.element.naturalWidth,
      imageHeight: object.element.naturalHeight,
      figureIndex: options.figureIndex,
      figureCount: options.figureCount,
      avatarPositionX: options.avatarPositionX,
      avatarPositionY: options.avatarPositionY,
    });
  }

  protected async createObject(
    type: string,
    value: string,
  ): Promise<ImageObject> {
    const blob = await this.package_.getBlob(type, value);
    const blobUrl = URL.createObjectURL(blob);
    try {
      const image = new ImageObject(this.package_.manifest.density);
      await image.loadImage(blobUrl);
      return image;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  protected destroyObject(_object: ImageObject) {}

  protected attachObject(object: ImageObject) {
    this.layer.appendChild(object.element);
  }

  protected detachObject(object: ImageObject) {
    object.element.remove();
  }

  protected getPropertyValue(
    object: ImageObject,
    propertyName: keyof ImageElementResolvedProperties,
  ): ImageElementResolvedProperties[typeof propertyName] {
    return object.getPropertyValue(propertyName);
  }

  protected setPropertyValue(
    object: ImageObject,
    propertyName: keyof ImageElementResolvedProperties,
    propertyValue: ImageElementResolvedProperties[typeof propertyName],
  ) {
    object.setPropertyValue(propertyName, propertyValue);
  }
}

export class TextElement extends BaseElement<
  TextObject,
  TextElementProperties,
  TextElementResolvedProperties,
  unknown
> {
  constructor(
    private readonly package_: Package,
    private readonly container: HTMLElement,
    ticker: Ticker,
    private readonly enterByGraphemeCluster: boolean,
  ) {
    super(ticker, false);
  }

  protected resolveProperties(
    properties: TextElementProperties,
    _object: TextObject,
    valueChanged: boolean,
    _options: unknown,
  ): TextElementResolvedProperties {
    return TextElementResolvedProperties.resolve(properties, { valueChanged });
  }

  protected async createObject(
    _type: string,
    value: string,
  ): Promise<TextObject> {
    return new TextObject(
      value,
      this.package_.manifest.locale,
      this.enterByGraphemeCluster,
    );
  }

  protected destroyObject(_object: TextObject) {}

  protected attachObject(object: TextObject) {
    this.container.appendChild(object.element);
  }

  protected detachObject(object: TextObject) {
    object.element.remove();
  }

  protected getTransitionElementCount(
    object: TextObject,
    isEnter: boolean,
  ): number {
    return isEnter && this.enterByGraphemeCluster
      ? object.transitionElementCount
      : 1;
  }

  protected getPropertyValue(
    object: TextObject,
    propertyName: keyof TextElementResolvedProperties,
  ): TextElementResolvedProperties[typeof propertyName] {
    return object.getPropertyValue(propertyName);
  }

  protected setPropertyValue(
    object: TextObject,
    propertyName: keyof TextElementResolvedProperties,
    propertyValue: TextElementResolvedProperties[typeof propertyName],
  ) {
    object.setPropertyValue(propertyName, propertyValue);
  }
}
