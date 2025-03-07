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
import { Entries } from '../util';
import {
  ImageElementResolvedProperties,
  resolveElementTransitionDuration,
  resolveElementValue,
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

export interface ImageElementTransitionOptions {
  figureIndex: number;
  figureCount: number;
}

export class ImageElement
  implements Element<ImageElementProperties, ImageElementTransitionOptions>
{
  private sprite: ImageSprite | undefined;
  private properties: ImageElementProperties | undefined;
  private options: ImageElementTransitionOptions | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spriteTransitions = new MultiMap<ImageSprite, Transition<any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private propertyTransitions = new MultiMap<string, Transition<any>>();

  constructor(
    private package_: Package,
    private container: Container,
  ) {}

  *transition(
    properties: ImageElementProperties,
    options: ImageElementTransitionOptions,
  ): Generator<Promise<unknown>, void, void> {
    const oldSprite = this.sprite;
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

    let newSprite: ImageSprite | undefined;
    if (newValue && newValue !== oldValue) {
      yield this.package_
        .getBlob(newProperties.type, newValue)
        .then(async blob => {
          const blobUrl = URL.createObjectURL(blob);
          try {
            const newTexture = await Assets.load({
              src: blobUrl,
              loadParser: 'loadTextures',
            });
            newSprite = new ImageSprite(newTexture);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        });
    } else {
      yield Promise.resolve();
    }

    let oldSpriteOldProperties: ImageElementResolvedProperties | undefined;
    let oldSpriteNewProperties: ImageElementResolvedProperties | undefined;
    if (oldSprite) {
      oldSpriteOldProperties = this.resolveProperties(
        oldProperties!,
        oldSprite,
        oldValue,
        oldOptions!,
      );
      oldSpriteNewProperties = newValue
        ? this.resolveProperties(newProperties, oldSprite, newValue, newOptions)
        : this.resolveProperties(
            oldProperties!,
            oldSprite,
            newValue,
            oldOptions!,
          );
    }
    let newSpriteOldProperties: ImageElementResolvedProperties | undefined;
    let newSpriteNewProperties: ImageElementResolvedProperties | undefined;
    if (newSprite) {
      newSpriteOldProperties = oldValue
        ? this.resolveProperties(
            oldProperties!,
            newSprite,
            oldValue,
            oldOptions!,
          )
        : this.resolveProperties(
            newProperties,
            newSprite,
            oldValue,
            newOptions,
          );
      newSpriteNewProperties = this.resolveProperties(
        newProperties,
        newSprite,
        newValue,
        newOptions,
      );
    }

    if (newSprite) {
      for (const [propertyName, propertyValue] of Object.entries(
        newSpriteOldProperties!,
      ) as Entries<ImageElementResolvedProperties>) {
        newSprite.setPropertyValue(propertyName, propertyValue);
      }
      this.container.addChild(newSprite);
    }

    const propertyNames = Object.keys(
      (oldSpriteOldProperties ?? newSpriteNewProperties)!,
    ) as [keyof ImageElementResolvedProperties];
    const transitionDuration = resolveElementTransitionDuration(newProperties);
    for (const propertyName of propertyNames) {
      const oldSpriteChanged =
        oldSpriteOldProperties?.[propertyName] !==
        oldSpriteNewProperties?.[propertyName];
      const newSpriteChanged =
        newSpriteOldProperties?.[propertyName] !==
        newSpriteNewProperties?.[propertyName];
      if (oldSpriteChanged || newSpriteChanged) {
        this.propertyTransitions.get(propertyName)?.forEach(it => it.end());
      }

      if (oldSpriteChanged) {
        this.transitionProperty(
          oldSprite!,
          propertyName,
          oldSpriteNewProperties![propertyName],
          transitionDuration,
        );
      }
      if (newSpriteChanged) {
        this.transitionProperty(
          newSprite!,
          propertyName,
          newSpriteNewProperties![propertyName],
          transitionDuration,
        );
      }
    }

    if (newValue) {
      this.sprite = newSprite ?? oldSprite;
      this.properties = newProperties;
      this.options = newOptions;
    } else {
      this.sprite = undefined;
      this.properties = undefined;
      this.options = undefined;
    }
  }

  private resolveProperties(
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

  private transitionProperty(
    sprite: ImageSprite,
    propertyName: keyof ImageElementResolvedProperties,
    propertyValue: ImageElementResolvedProperties[typeof propertyName],
    transitionDuration: number,
  ) {
    const currentPropertyValue = sprite.getPropertyValue(propertyName);
    const transition = new Transition(
      currentPropertyValue,
      propertyValue,
      transitionDuration,
    )
      .addOnUpdateCallback(it => sprite.setPropertyValue(propertyName, it))
      .addOnEndCallback(() => {
        this.spriteTransitions.remove(sprite, transition);
        this.propertyTransitions.remove(propertyName, transition);
        SharedTransitionTicker.remove(transition);
        if (propertyName === 'value' && propertyValue === 0) {
          this.spriteTransitions.get(sprite)?.forEach(it => it.end());
          sprite.removeFromParent();
          sprite.destroy(true);
          // TODO: Remove this element if there's no sprite?
        }
      });
    this.spriteTransitions.set(sprite, transition);
    this.propertyTransitions.set(propertyName, transition);
    SharedTransitionTicker.add(transition);
    transition.start();
  }

  wait(propertyMatcher: Matcher): Promise<void> {
    return Promise.all(
      Array.from(this.propertyTransitions.entries())
        .filter(it => propertyMatcher.match(it[0]))
        .map(it => it[1].asPromise()),
    ).then(() => {});
  }

  snap(propertyMatcher: Matcher) {
    for (const [
      propertyName,
      transition,
    ] of this.propertyTransitions.entries()) {
      if (propertyMatcher.match(propertyName)) {
        transition.end();
      }
    }
  }
}

export class NameTextElement
  implements Element<TextElementProperties, unknown>
{
  private properties: TextElementProperties | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private propertyTransitions = new Map<string, Transition<any>>();

  constructor(
    // @ts-expect-error TS6138
    private package_: Package,
    private element: HTMLElement,
  ) {}

  *transition(
    properties: TextElementProperties,
  ): Generator<Promise<unknown>, void, void> {
    const oldProperties = this.properties;
    const newProperties = properties;

    const oldValue = oldProperties
      ? resolveElementValue(oldProperties)
      : undefined;
    const newValue = resolveElementValue(newProperties);
    if (oldValue === newValue) {
      yield Promise.resolve();
      return;
    }

    // TODO: Load translations.
    const text = newValue ?? '';
    yield Promise.resolve();

    // TODO: Defend against XSS.
    this.element.innerHTML = text;

    this.properties = newValue !== undefined ? newProperties : undefined;
  }

  wait(propertyMatcher: Matcher): Promise<void> {
    return Promise.all(
      Array.from(this.propertyTransitions.entries())
        .filter(it => propertyMatcher.match(it[0]))
        .map(it => it[1].asPromise()),
    ).then(() => {});
  }

  snap(propertyMatcher: Matcher) {
    for (const [
      propertyName,
      transition,
    ] of this.propertyTransitions.entries()) {
      if (propertyMatcher.match(propertyName)) {
        transition.end();
      }
    }
  }
}

export class TextTextElement
  implements Element<TextElementProperties, unknown>
{
  private properties: TextElementProperties | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private propertyTransitions = new Map<string, Transition<any>>();

  constructor(
    private package_: Package,
    private element: HTMLElement,
  ) {}

  *transition(
    properties: TextElementProperties,
  ): Generator<Promise<unknown>, void, void> {
    const oldProperties = this.properties;
    const newProperties = properties;

    const oldValue = oldProperties
      ? resolveElementValue(oldProperties)
      : undefined;
    const newValue = resolveElementValue(newProperties);
    if (oldValue === newValue) {
      yield Promise.resolve();
      return;
    }

    // TODO: Load translations.
    const text = newValue ?? '';
    yield Promise.resolve();

    this.propertyTransitions.get('value')?.end();
    if (!text) {
      this.element.innerHTML = '';
      return;
    }
    // TODO: Defend against XSS.
    this.element.innerHTML = text;
    const textNodeIterator = document.createNodeIterator(
      this.element,
      NodeFilter.SHOW_TEXT,
    );
    const textNodes = [];
    while (textNodeIterator.nextNode()) {
      textNodes.push(textNodeIterator.referenceNode as Text);
    }
    const segmenter = new Intl.Segmenter(this.package_.manifest.locale);
    const spans: HTMLSpanElement[] = [];
    for (const textNode of textNodes) {
      const textSpans = [];
      for (const { segment } of segmenter.segment(textNode.data)) {
        const span = document.createElement('span');
        span.textContent = segment;
        textSpans.push(span);
        spans.push(span);
      }
      textNode.replaceWith(...textSpans);
    }

    let transitionDuration = resolveElementTransitionDuration(properties);
    if (transitionDuration === -1) {
      transitionDuration = spans.length * 50;
    }
    const transition = new Transition(0, spans.length, transitionDuration)
      .addOnUpdateCallback(it => {
        for (let i = 0; i < spans.length; ++i) {
          const opacity = Math.max(0, Math.min(it - i, 1));
          if (opacity === 1) {
            spans[i].removeAttribute('style');
          } else {
            spans[i].style.opacity = opacity.toString();
          }
        }
      })
      .addOnEndCallback(() => {
        this.propertyTransitions.delete('value');
        SharedTransitionTicker.remove(transition);
      });
    this.propertyTransitions.set('value', transition);
    SharedTransitionTicker.add(transition);
    transition.start();

    this.properties = newValue !== undefined ? newProperties : undefined;
  }

  wait(propertyMatcher: Matcher): Promise<void> {
    return Promise.all(
      Array.from(this.propertyTransitions.entries())
        .filter(it => propertyMatcher.match(it[0]))
        .map(it => it[1].asPromise()),
    ).then(() => {});
  }

  snap(propertyMatcher: Matcher) {
    for (const [
      propertyName,
      transition,
    ] of this.propertyTransitions.entries()) {
      if (propertyMatcher.match(propertyName)) {
        transition.end();
      }
    }
  }
}
