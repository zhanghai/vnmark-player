import {VnmarkEngineError} from './VnmarkEngine';

import {
  VnmarkAngle,
  VnmarkBoolean,
  VnmarkInitial,
  VnmarkLength,
  VnmarkNone,
  VnmarkNumber,
  VnmarkPercentage,
  VnmarkPropertyValue,
  VnmarkString,
  VnmarkTime,
  VnmarkZero,
} from './VnmarkPropertyValue';

export interface VnmarkBaseElementProperties {
  readonly type: string;
  readonly index?: number;
  readonly value?: VnmarkNone | VnmarkString;
  readonly transitionDuration?: VnmarkZero | VnmarkTime;
}

export interface VnmarkImageElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'background' | 'foreground' | 'figure' | 'avatar';
  readonly anchorX?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly anchorY?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly positionX?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly positionY?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly offsetX?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly offsetY?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly pivotX?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly pivotY?: VnmarkZero | VnmarkLength | VnmarkPercentage;
  readonly scaleX?: VnmarkNumber | VnmarkPercentage;
  readonly scaleY?: VnmarkNumber | VnmarkPercentage;
  readonly skewX?: VnmarkZero | VnmarkAngle;
  readonly skewY?: VnmarkZero | VnmarkAngle;
  readonly rotation?: VnmarkZero | VnmarkAngle;
  readonly alpha?: VnmarkNumber | VnmarkPercentage;
}

export interface VnmarkTextElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'name' | 'text' | 'choice';
}

export interface VnmarkChoiceElementProperties extends VnmarkTextElementProperties {
  readonly type: 'choice';
  readonly enabled?: VnmarkBoolean;
  readonly script?: VnmarkString;
}

export interface VnmarkAudioElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'music' | 'sound' | 'voice';
  readonly volume?: VnmarkNumber | VnmarkPercentage;
}

export interface VnmarkVideoElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'video';
}

export interface VnmarkEffectElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'effect';
}

export interface VnmarkLayoutElementProperties extends VnmarkBaseElementProperties {
  readonly type: 'layout';
}

export type VnmarkElementProperties =
  VnmarkImageElementProperties | VnmarkTextElementProperties | VnmarkChoiceElementProperties |
  VnmarkAudioElementProperties | VnmarkVideoElementProperties | VnmarkEffectElementProperties |
  VnmarkLayoutElementProperties;

export type VnmarkProperty = {
  readonly type: VnmarkElementProperties['type'];
  readonly index?: VnmarkElementProperties['index'];
  readonly name: string;
  readonly value: VnmarkPropertyValue;
}

export namespace VnmarkProperty {
  export function parse(
    elementName: string,
    propertyName: string,
    propertyValue: string
  ): VnmarkProperty {
    const elementNameMatch =
      elementName.match(/^([A-Za-z_](?:[A-Za-z0-9_]*[A-Za-z_])?)([1-9][0-9]*)?$/);
    if (!elementNameMatch) {
      throw new VnmarkEngineError(`Unsupported element name "${elementName}"`);
    }
    const [, type, indexString] = elementNameMatch;
    let index: number | undefined;
    switch (type) {
      case 'background':
      case 'foreground':
      case 'figure':
      case 'avatar':
      case 'name':
      case 'text':
      case 'choice':
      case 'music':
      case 'sound':
      case 'voice':
      case 'video':
      case 'effect':
        index = indexString ? Number(indexString) : 1;
        break;
      case 'layout':
        if (indexString) {
          throw new VnmarkEngineError(
            `Unsupported index ${indexString} on element type "${type}" from "${elementName}"`
          );
        }
        break;
      default:
        throw new VnmarkEngineError(`Unsupported element type "${type}" from "${elementName}"`);
    }
    let name: string | undefined;
    let value: VnmarkPropertyValue | undefined;
    switch (propertyName) {
      case 'value':
        name = 'value';
        value =
          parsePropertyValue(
            propertyName,
            propertyValue,
            it => VnmarkNone.parse(it) ?? VnmarkString.parse(it),
          );
        break;
      case 'transition_duration':
        name = 'transitionDuration';
        value =
          parsePropertyValue(
            propertyName,
            propertyValue,
            it => VnmarkZero.parse(it) ?? VnmarkTime.parse(it),
          );
        break;
    }
    if (name === undefined) {
      switch (type) {
        case 'background':
        case 'foreground':
        case 'figure':
        case 'avatar':
          switch (propertyName) {
            case 'anchor_x':
              name = 'anchorX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'anchor_y':
              name = 'anchorY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'position_x':
              name = 'positionX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'position_y':
              name = 'positionY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'offset_x':
              name = 'offsetX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'offset_y':
              name = 'offsetY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'pivot_x':
              console.log(type, propertyName, propertyValue);
              name = 'pivotX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it)
                    ?? VnmarkPercentage.parse(it),
                );
              break;
            case 'pivot_y':
              name = 'pivotY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkLength.parse(it) ??
                    VnmarkPercentage.parse(it),
                );
              break;
            case 'scale_x':
              name = 'scaleX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkNumber.parse(it) ?? VnmarkPercentage.parse(it)
                );
              break;
            case 'scale_y':
              name = 'scaleY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkNumber.parse(it) ?? VnmarkPercentage.parse(it)
                );
              break;
            case 'skew_x':
              name = 'skewX';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkAngle.parse(it)
                );
              break;
            case 'skew_y':
              name = 'skewY';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkAngle.parse(it)
                );
              break;
            case 'rotation':
              name = 'rotation';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkZero.parse(it) ?? VnmarkAngle.parse(it)
                );
              break;
            case 'alpha':
              name = 'alpha';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkNumber.parse(it) ?? VnmarkPercentage.parse(it)
                );
              break;
          }
          break;
        case 'name':
        case 'text':
          break;
        case 'choice':
          switch (propertyName) {
            case 'enabled':
              name = 'enabled';
              value =
                parsePropertyValue(propertyName, propertyValue, it => VnmarkBoolean.parse(it));
              break;
            case 'script':
              name = 'script';
              value = parsePropertyValue(propertyName, propertyValue, it => VnmarkString.parse(it));
              break;
          }
          break;
        case 'music':
        case 'sound':
        case 'voice':
          switch (propertyName) {
            case 'volume':
              name = 'volume';
              value =
                parsePropertyValue(
                  propertyName,
                  propertyValue,
                  it => VnmarkNumber.parse(it) ?? VnmarkPercentage.parse(it)
                );
              break;
            case 'loop':
              name = 'loop';
              value =
                parsePropertyValue(propertyName, propertyValue, it => VnmarkBoolean.parse(it));
              break;
          }
          break;
        case 'video':
          break;
        case 'effect':
          break;
        case 'layout':
          break;
        default:
          throw new VnmarkEngineError(`Unexpected element type "${type}"`);
      }
    }
    if (name === undefined || value === undefined) {
      throw new VnmarkEngineError(
        `Unexpected property name "${propertyName}" on element type "${type}"`
      );
    }
    return {type, ...(index && {index}), name, value};
  }

  function parsePropertyValue<T extends VnmarkPropertyValue | undefined>(
    propertyName: string,
    propertyValue: string,
    parse: (source: string) => T,
  ): VnmarkInitial | NonNullable<T> {
    const value = VnmarkInitial.parse(propertyValue) ?? parse(propertyValue);
    if (value === undefined) {
      throw new VnmarkEngineError(
        `Invalid value "${propertyValue}" for property "${propertyName}"`
      );
    }
    return value;
  }
}
