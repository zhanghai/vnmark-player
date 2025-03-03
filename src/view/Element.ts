import { Assets, Container, Texture } from 'pixi.js';
import { MultiMap } from 'mnemonist';
import { Transition } from '../transition';
import { Entries } from '../util';
import { ElementProperties, ImageElementProperties } from '../engine';
import {
  ImageElementResolvedProperties,
  resolveElementTransitionDuration,
  resolveElementValue,
} from './ElementResolvedProperties';
import { ImageSprite } from './ImageSprite';
import { SharedTransitionTicker } from './TransitionTicker';
import { Package } from '../package';

export interface Element<
  PropertiesType extends ElementProperties,
  OptionsType,
> {
  transition(
    properties: PropertiesType,
    options: OptionsType,
  ): Generator<Promise<unknown>, void, void>;
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
      const blobUrl = URL.createObjectURL(
        this.package_.getBlob(newProperties.type, newValue),
      );
      // TODO: Allow proper caching.
      const newTexturePromise = Assets.load({
        src: blobUrl,
        loadParser: 'loadTextures',
      });
      let newTexture: Texture;
      newTexturePromise
        .then(it => {
          newTexture = it;
        })
        .finally(() => URL.revokeObjectURL(blobUrl));
      yield newTexturePromise;
      newSprite = new ImageSprite(newTexture!);
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
      //.setEasing(Material3Easings.Standard)
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
}
