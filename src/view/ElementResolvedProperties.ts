import {
  AngleValue,
  BaseElementProperties,
  ImageElementProperties,
  LengthValue,
  NoneValue,
  NumberValue,
  PercentageValue,
  PropertyValue,
  StringValue,
  TextElementProperties,
  TimeValue,
  ZeroValue,
} from '../engine';
import { ViewError } from './View';

export function resolveElementValue(
  properties: BaseElementProperties,
): string | undefined {
  const value = resolvePropertyValue(
    properties.value,
    it => NoneValue.resolve(it) ?? StringValue.resolve(it),
  );
  if (value === NoneValue.VALUE) {
    return undefined;
  }
  return value;
}

export function resolveElementTransitionDuration(
  properties: BaseElementProperties,
  elementCount: number,
): number {
  let defaultTransitionDuration: number;
  switch (properties.type) {
    case 'background':
      defaultTransitionDuration = 1000;
      break;
    case 'foreground':
    case 'figure':
    case 'avatar':
      defaultTransitionDuration = 500;
      break;
    case 'name':
      defaultTransitionDuration = 0;
      break;
    case 'text':
      defaultTransitionDuration = 50 * elementCount;
      break;
    case 'choice':
      defaultTransitionDuration = 0;
      break;
    case 'music':
      defaultTransitionDuration = 1000;
      break;
    case 'sound':
    case 'voice':
    case 'video':
    case 'effect':
      defaultTransitionDuration = 0;
      break;
    case 'layout':
      defaultTransitionDuration = 1000;
      break;
    default:
      throw new ViewError(`Unexpected element type "${properties.type}"`);
  }
  return (
    resolvePropertyValue(
      properties.transitionDuration,
      it => ZeroValue.resolve(it) ?? TimeValue.resolve(it, elementCount),
    ) ?? defaultTransitionDuration
  );
}

export interface ImageElementResolvedProperties {
  readonly value: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewX: number;
  readonly skewY: number;
  readonly rotation: number;
  readonly alpha: number;
}

export namespace ImageElementResolvedProperties {
  export interface ResolveOptions {
    valueChanged: boolean;
    density: number;
    screenWidth: number;
    screenHeight: number;
    imageWidth: number;
    imageHeight: number;
    figureIndex: number;
    figureCount: number;
    avatarPositionX: number;
    avatarPositionY: number;
  }

  export function resolve(
    properties: ImageElementProperties,
    options: ResolveOptions,
  ): ImageElementResolvedProperties {
    const value = options.valueChanged ? 0 : 1;
    const anchorX =
      resolvePropertyValue(
        properties.anchorX,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.imageWidth),
      ) ?? (properties.type === 'figure' ? options.imageWidth / 2 : 0);
    const anchorY =
      resolvePropertyValue(
        properties.anchorY,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.imageHeight),
      ) ?? (properties.type === 'figure' ? options.imageHeight : 0);
    let defaultPositionX;
    let defaultPositionY;
    switch (properties.type) {
      case 'figure':
        defaultPositionX =
          (options.figureIndex / (options.figureCount + 1)) *
          options.screenWidth;
        defaultPositionY = options.screenHeight;
        break;
      case 'avatar':
        defaultPositionX = options.avatarPositionX;
        defaultPositionY = options.avatarPositionY;
        break;
      default:
        defaultPositionX = 0;
        defaultPositionY = 0;
    }
    const positionX =
      resolvePropertyValue(
        properties.positionX,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.screenWidth),
      ) ?? defaultPositionX;
    const positionY =
      resolvePropertyValue(
        properties.positionY,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.screenHeight),
      ) ?? defaultPositionY;
    const offsetX =
      resolvePropertyValue(
        properties.offsetX,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.screenWidth),
      ) ?? (properties.type === 'figure' ? options.screenWidth : 0);
    const offsetY =
      resolvePropertyValue(
        properties.offsetY,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.screenHeight),
      ) ?? (properties.type === 'figure' ? options.screenHeight : 0);
    const pivotX =
      resolvePropertyValue(
        properties.pivotX,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.imageWidth),
      ) ?? options.imageWidth / 2;
    const pivotY =
      resolvePropertyValue(
        properties.pivotY,
        it =>
          ZeroValue.resolve(it) ??
          LengthValue.resolve(it, options.density) ??
          PercentageValue.resolve(it, options.imageHeight),
      ) ?? options.imageHeight / 2;
    const scaleX =
      resolvePropertyValue(
        properties.scaleX,
        it => NumberValue.resolve(it) ?? PercentageValue.resolve(it, 1),
      ) ?? 1;
    const scaleY =
      resolvePropertyValue(
        properties.scaleY,
        it => NumberValue.resolve(it) ?? PercentageValue.resolve(it, 1),
      ) ?? 1;
    const skewX =
      resolvePropertyValue(
        properties.skewX,
        it => ZeroValue.resolve(it) ?? AngleValue.resolve(it),
      ) ?? 0;
    const skewY =
      resolvePropertyValue(
        properties.skewY,
        it => ZeroValue.resolve(it) ?? AngleValue.resolve(it),
      ) ?? 0;
    const rotation =
      resolvePropertyValue(
        properties.rotation,
        it => ZeroValue.resolve(it) ?? AngleValue.resolve(it),
      ) ?? 0;
    const alpha =
      resolvePropertyValue(
        properties.alpha,
        it => NumberValue.resolve(it) ?? PercentageValue.resolve(it, 1),
      ) ?? 1;
    return {
      value,
      anchorX,
      anchorY,
      positionX,
      positionY,
      offsetX,
      offsetY,
      pivotX,
      pivotY,
      scaleX,
      scaleY,
      skewX,
      skewY,
      rotation,
      alpha,
    };
  }
}

export interface TextElementResolvedProperties {
  readonly value: number;
}

export namespace TextElementResolvedProperties {
  export interface ResolveOptions {
    valueChanged: boolean;
  }

  export function resolve(
    _properties: TextElementProperties,
    options: ResolveOptions,
  ): TextElementResolvedProperties {
    const value = options.valueChanged ? 0 : 1;
    return { value };
  }
}

function resolvePropertyValue<T extends PropertyValue, R>(
  value: T | undefined,
  resolve: (value: T) => R,
): R | undefined {
  if (!value) {
    return undefined;
  }
  const resolvedValue = resolve(value);
  if (resolvedValue === undefined) {
    throw new ViewError(`Unable to resolve value ${value}`);
  }
  return resolvedValue;
}
