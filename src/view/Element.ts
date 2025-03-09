import { MultiMap } from 'mnemonist';
import { Assets, Container } from 'pixi.js';

import {
  ElementProperties,
  ImageElementProperties,
  Matcher,
  TextElementProperties,
} from '../engine';
import { Package } from '../package';
import { Transition } from '../transition';
import { AnimatedText } from './AnimatedText';
import {
  ImageElementResolvedProperties,
  resolveElementTransitionDuration,
  resolveElementValue,
  TextElementResolvedProperties,
} from './ElementResolvedProperties';
import { ImageSprite } from './ImageSprite';
import { SharedTransitionTicker } from './TransitionTicker';

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
  private objectTransitions = new MultiMap<Object, Transition<any>>();
  private propertyTransitions = new MultiMap<
    keyof ResolvedProperties,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Transition<any>
  >();

  protected constructor(protected readonly isCrossfade: boolean) {}

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
        oldValue,
        oldOptions!,
      );
      oldObjectNewProperties = this.resolveProperties(
        this.isCrossfade && newValue ? newProperties : oldProperties!,
        oldObject,
        newValue,
        this.isCrossfade && newValue ? newOptions : oldOptions!,
      );
    }
    let newObjectOldProperties: ResolvedProperties | undefined;
    let newObjectNewProperties: ResolvedProperties | undefined;
    if (newObject) {
      newObjectOldProperties = this.resolveProperties(
        this.isCrossfade && oldValue ? oldProperties! : newProperties,
        newObject,
        oldValue,
        this.isCrossfade && oldValue ? oldOptions! : newOptions,
      );
      newObjectNewProperties = this.resolveProperties(
        newProperties,
        newObject,
        newValue,
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
    const newObjectTransitionDelay = this.isCrossfade
      ? oldObjectTransitionDuration
      : 0;
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
    currentValue: string | undefined,
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
        SharedTransitionTicker.remove(transition);
        if (propertyName === 'value' && propertyValue === 0) {
          this.objectTransitions.get(object)?.forEach(it => it.end());
          this.detachObject(object);
          this.destroyObject(object);
          // TODO: Remove this element if there's no object?
        }
      });
    this.objectTransitions.set(object, transition);
    this.propertyTransitions.set(propertyName, transition);
    SharedTransitionTicker.add(transition);
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
}

export class ImageElement extends BaseElement<
  ImageSprite,
  ImageElementProperties,
  ImageElementResolvedProperties,
  ImageElementTransitionOptions
> {
  constructor(
    private readonly package_: Package,
    private readonly container: Container,
  ) {
    super(true);
  }

  protected resolveProperties(
    properties: ImageElementProperties,
    sprite: ImageSprite,
    currentValue: string | undefined,
    options: ImageElementTransitionOptions,
  ): ImageElementResolvedProperties {
    const manifest = this.package_.manifest;
    return ImageElementResolvedProperties.resolve(properties, {
      currentValue,
      density: manifest.density,
      screenWidth: manifest.width,
      screenHeight: manifest.height,
      imageWidth: sprite.width,
      imageHeight: sprite.height,
      figureIndex: options.figureIndex,
      figureCount: options.figureCount,
    });
  }

  protected async createObject(
    type: string,
    value: string,
  ): Promise<ImageSprite> {
    const blob = await this.package_.getBlob(type, value);
    const blobUrl = URL.createObjectURL(blob);
    try {
      const texture = await Assets.load({
        src: blobUrl,
        loadParser: 'loadTextures',
      });
      return new ImageSprite(texture);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  protected destroyObject(object: ImageSprite) {
    object.destroy(true);
  }

  protected attachObject(object: ImageSprite) {
    this.container.addChild(object);
  }

  protected detachObject(object: ImageSprite) {
    object.removeFromParent();
  }

  protected getPropertyValue(
    object: ImageSprite,
    propertyName: keyof ImageElementResolvedProperties,
  ): ImageElementResolvedProperties[typeof propertyName] {
    return object.getPropertyValue(propertyName);
  }

  protected setPropertyValue(
    object: ImageSprite,
    propertyName: keyof ImageElementResolvedProperties,
    propertyValue: ImageElementResolvedProperties[typeof propertyName],
  ) {
    object.setPropertyValue(propertyName, propertyValue);
  }
}

export class TextElement extends BaseElement<
  AnimatedText,
  TextElementProperties,
  TextElementResolvedProperties,
  unknown
> {
  constructor(
    private readonly package_: Package,
    private readonly element: HTMLElement,
    private readonly enterByGraphemeCluster: boolean,
  ) {
    super(false);
  }

  protected resolveProperties(
    properties: TextElementProperties,
    _object: AnimatedText,
    currentValue: string | undefined,
    _options: unknown,
  ): TextElementResolvedProperties {
    return TextElementResolvedProperties.resolve(properties, { currentValue });
  }

  protected async createObject(
    _type: string,
    value: string,
  ): Promise<AnimatedText> {
    return new AnimatedText(
      value,
      this.package_.manifest.locale,
      this.enterByGraphemeCluster,
    );
  }

  protected destroyObject(_object: AnimatedText) {}

  protected attachObject(object: AnimatedText) {
    this.element.appendChild(object.element);
  }

  protected detachObject(object: AnimatedText) {
    object.element.remove();
  }

  protected getTransitionElementCount(
    object: AnimatedText,
    isEnter: boolean,
  ): number {
    return isEnter && this.enterByGraphemeCluster
      ? object.transitionElementCount
      : 1;
  }

  protected getPropertyValue(
    object: AnimatedText,
    propertyName: keyof TextElementResolvedProperties,
  ): TextElementResolvedProperties[typeof propertyName] {
    return object.getPropertyValue(propertyName);
  }

  protected setPropertyValue(
    object: AnimatedText,
    propertyName: keyof TextElementResolvedProperties,
    propertyValue: TextElementResolvedProperties[typeof propertyName],
  ) {
    object.setPropertyValue(propertyName, propertyValue);
  }
}
