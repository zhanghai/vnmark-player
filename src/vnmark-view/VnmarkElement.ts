import {Assets, Container, Texture} from 'pixi.js';
import {MultiMap} from 'mnemonist';
import {Material3Easings, Transition} from '../transition';
import {Entries} from '../util';
import {
  VnmarkElementProperties,
  VnmarkEngine,
  VnmarkImageElementProperties,
} from '../vnmark-engine';
import {
  resolveVnmarkElementTransitionDuration,
  resolveVnmarkElementValue,
  VnmarkImageElementResolvedProperties,
} from './VnmarkElementResolvedProperties';
import {VnmarkSprite} from './VnmarkSprite';
import {VnmarkSharedTicker} from './VnmarkTicker';

export interface VnmarkElement<PropertiesType extends VnmarkElementProperties, OptionsType> {
  transition(
    properties: PropertiesType,
    options: OptionsType,
  ): Generator<Promise<unknown>, void, void>;
}

export interface VnmarkImageElementTransitionOptions {
  figureIndex: number;
  figureCount: number;
}

export class VnmarkImageElement
  implements VnmarkElement<VnmarkImageElementProperties, VnmarkImageElementTransitionOptions> {
  private sprite: VnmarkSprite | undefined;
  private properties: VnmarkImageElementProperties | undefined;
  private options: VnmarkImageElementTransitionOptions | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spriteTransitions = new MultiMap<VnmarkSprite, Transition<any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private propertyTransitions = new MultiMap<string, Transition<any>>();

  constructor(private engine: VnmarkEngine, private container: Container) {}

  * transition(
    properties: VnmarkImageElementProperties,
    options: VnmarkImageElementTransitionOptions
  ): Generator<Promise<unknown>, void, void> {
    const oldSprite = this.sprite;
    const oldProperties = this.properties;
    const oldOptions = this.options;
    const newProperties = properties;
    const newOptions = options;

    const oldValue = oldProperties ? resolveVnmarkElementValue(oldProperties) : undefined;
    const newValue = resolveVnmarkElementValue(newProperties);
    if (!oldValue && !newValue) {
      yield Promise.resolve();
      return;
    }

    let newSprite: VnmarkSprite | undefined;
    if (newValue && newValue !== oldValue) {
      const blobUrl = URL.createObjectURL(this.engine.getBlob(newProperties.type, newValue));
      // TODO: Allow proper caching.
      const newTexturePromise = Assets.load({src: blobUrl, loadParser: 'loadTextures'});
      let newTexture: Texture;
      newTexturePromise.then(it => newTexture = it).finally(() => URL.revokeObjectURL(blobUrl));
      yield newTexturePromise;
      newSprite = new VnmarkSprite(newTexture!);
    } else {
      yield Promise.resolve();
    }

    let oldSpriteOldProperties: VnmarkImageElementResolvedProperties | undefined;
    let oldSpriteNewProperties: VnmarkImageElementResolvedProperties | undefined;
    if (oldSprite) {
      oldSpriteOldProperties =
        this.resolveProperties(oldProperties!, oldSprite, oldValue, oldOptions!)
      oldSpriteNewProperties =
        newValue ? this.resolveProperties(newProperties, oldSprite, newValue, newOptions)
          : this.resolveProperties(oldProperties!, oldSprite, newValue, oldOptions!);
    }
    let newSpriteOldProperties: VnmarkImageElementResolvedProperties | undefined;
    let newSpriteNewProperties: VnmarkImageElementResolvedProperties | undefined;
    if (newSprite) {
      newSpriteOldProperties =
        oldValue ? this.resolveProperties(oldProperties!, newSprite, oldValue, oldOptions!)
          : this.resolveProperties(newProperties, newSprite, oldValue, newOptions);
      newSpriteNewProperties =
        this.resolveProperties(newProperties, newSprite, newValue, newOptions);
    }

    if (newSprite) {
      for (const [propertyName, propertyValue] of
        Object.entries(newSpriteOldProperties!) as
          Entries<VnmarkImageElementResolvedProperties>) {
        newSprite.setPropertyValue(propertyName, propertyValue);
      }
      this.container.addChild(newSprite);
    }

    const propertyNames =
      Object.keys((oldSpriteOldProperties ?? newSpriteNewProperties)!) as
        [keyof VnmarkImageElementResolvedProperties];
    const transitionDuration = resolveVnmarkElementTransitionDuration(newProperties);
    for (const propertyName of propertyNames) {
      const oldSpriteChanged =
        oldSpriteOldProperties?.[propertyName] !== oldSpriteNewProperties?.[propertyName];
      const newSpriteChanged =
        newSpriteOldProperties?.[propertyName] !== newSpriteNewProperties?.[propertyName];
      if (oldSpriteChanged || newSpriteChanged) {
        this.propertyTransitions.get(propertyName)?.forEach(it => it.end());
      }

      if (oldSpriteChanged) {
        this.transitionProperty(oldSprite!, propertyName, oldSpriteNewProperties![propertyName],
          transitionDuration);
      }
      if (newSpriteChanged) {
        this.transitionProperty(newSprite!, propertyName, newSpriteNewProperties![propertyName],
          transitionDuration);
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
    properties: VnmarkImageElementProperties,
    sprite: VnmarkSprite,
    currentValue: string | undefined,
    options: VnmarkImageElementTransitionOptions,
  ): VnmarkImageElementResolvedProperties {
    const manifest = this.engine.manifest;
    return VnmarkImageElementResolvedProperties.resolve(properties, {
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
    sprite: VnmarkSprite,
    propertyName: keyof VnmarkImageElementResolvedProperties,
    propertyValue: VnmarkImageElementResolvedProperties[typeof propertyName],
    transitionDuration: number,
  ) {
    const currentPropertyValue = sprite.getPropertyValue(propertyName);
    const transition =
      new Transition(currentPropertyValue, propertyValue, transitionDuration)
        //.setEasing(Material3Easings.Standard)
        .addOnUpdateCallback(it => sprite.setPropertyValue(propertyName, it))
        .addOnEndCallback(() => {
          this.spriteTransitions.remove(sprite, transition);
          this.propertyTransitions.remove(propertyName, transition);
          VnmarkSharedTicker.remove(transition);
          if (propertyName === 'value' && propertyValue === 0) {
            this.spriteTransitions.get(sprite)?.forEach(it => it.end());
            sprite.removeFromParent();
            sprite.destroy(true);
            // TODO: Remove this element if there's no sprite?
          }
        });
    this.spriteTransitions.set(sprite, transition);
    this.propertyTransitions.set(propertyName, transition);
    VnmarkSharedTicker.add(transition);
    transition.start();
  }
}
