export interface VnmarkPropertyValue {
  type: string;
}

export interface VnmarkInitial extends VnmarkPropertyValue {
  type: 'initial';
}

export namespace VnmarkInitial {
  export function parse(source: string): VnmarkInitial | undefined {
    if (source !== 'initial') {
      return undefined
    }
    return {type: 'initial'};
  }
}

export interface VnmarkNone extends VnmarkPropertyValue {
  type: 'none';
}

export namespace VnmarkNone {
  export function parse(source: string): VnmarkNone | undefined {
    if (source !== 'none') {
      return undefined
    }
    return {type: 'none'};
  }

  export const VALUE = Symbol('VnmarkNone');

  export function resolve(value: VnmarkPropertyValue): typeof VALUE | undefined {
    if (value.type === 'none') {
      return VALUE;
    }
    return undefined;
  }
}

export interface VnmarkZero extends VnmarkPropertyValue {
  type: 'zero';
}

export namespace VnmarkZero {
  export function parse(source: string): VnmarkZero | undefined {
    if (source !== '0') {
      return undefined
    }
    return {type: 'zero'};
  }

  export function resolve(value: VnmarkPropertyValue): number | undefined {
    if (value.type === 'zero') {
      return 0;
    }
    return undefined;
  }
}

export interface VnmarkAngle extends VnmarkPropertyValue {
  type: 'angle';
  value: number;
  unit: 'deg' | 'rad' | 'grad' | 'turn';
}

export namespace VnmarkAngle {
  export function parse(source: string): VnmarkAngle | undefined {
    let unit: 'deg' | 'rad' | 'grad' | 'turn';
    if (source.endsWith('deg')) {
      unit = 'deg';
    } else if (source.endsWith('grad')) {
      unit = 'grad'
    } else if (source.endsWith('rad')) {
      unit = 'rad'
    } else if (source.endsWith('turn')) {
      unit = 'turn'
    } else {
      return undefined;
    }
    const value = Number(source.substring(0, source.length - unit.length));
    if (Number.isNaN(value)) {
      return undefined;
    }
    return {type: 'angle', value, unit};
  }

  export function resolve(value: VnmarkPropertyValue): number | undefined {
    if (value.type === 'angle') {
      const angle = value as VnmarkAngle;
      switch (angle.unit) {
        case "deg":
          return angle.value * Math.PI / 180;
        case "rad":
          return angle.value;
        case "grad":
          return angle.value * Math.PI / 200;
        case "turn":
          return angle.value * 2 * Math.PI;
      }
    }
    return undefined;
  }
}

export interface VnmarkBoolean extends VnmarkPropertyValue {
  type: 'boolean';
  value: boolean;
}

export namespace VnmarkBoolean {
  export function parse(source: string): VnmarkBoolean | undefined {
    let value: boolean;
    switch (source) {
      case 'true':
        value = true;
        break;
      case 'false':
        value = false;
        break;
      default:
        return undefined;
    }
    return {type: 'boolean', value};
  }
}

export interface VnmarkNumber extends VnmarkPropertyValue {
  type: 'number';
  value: number;
}

export namespace VnmarkNumber {
  export function parse(source: string): VnmarkNumber | undefined {
    const value = Number(source);
    if (Number.isNaN(value)) {
      return undefined;
    }
    return {type: 'number', value};
  }

  export function resolve(value: VnmarkPropertyValue): number | undefined {
    if (value.type === 'number') {
      const number = value as VnmarkNumber;
      return number.value;
    }
    return undefined;
  }
}

export interface VnmarkLength extends VnmarkPropertyValue {
  type: 'length';
  value: number;
  unit: 'px';
}

export namespace VnmarkLength {
  export function parse(source: string): VnmarkLength | undefined {
    if (!source.endsWith('px')) {
      return undefined;
    }
    const value = Number(source.substring(0, source.length - 2));
    if (Number.isNaN(value)) {
      return undefined;
    }
    return {type: 'length', value, unit: 'px'};
  }

  export function resolve(value: VnmarkPropertyValue, density: number): number | undefined {
    if (value.type === 'length') {
      const length = value as VnmarkLength;
      switch (length.unit) {
        case "px":
          return length.value * density;
      }
    }
    return undefined;
  }
}

export interface VnmarkPercentage extends VnmarkPropertyValue {
  type: 'percentage';
  value: number;
}

export namespace VnmarkPercentage {
  export function parse(source: string): VnmarkPercentage | undefined {
    if (!source.endsWith('%')) {
      return undefined;
    }
    const value = Number(source.substring(0, source.length - 1));
    if (Number.isNaN(value)) {
      return undefined;
    }
    return {type: 'percentage', value};
  }

  export function resolve(value: VnmarkPropertyValue, parentValue: number): number | undefined {
    if (value.type === 'percentage') {
      const percentage = value as VnmarkPercentage;
      return percentage.value / 100 * parentValue;
    }
    return undefined;
  }
}

export interface VnmarkString extends VnmarkPropertyValue {
  type: 'string';
  value: string;
}

export namespace VnmarkString {
  export function parse(source: string): VnmarkString | undefined {
    if (!source.startsWith('\'')) {
      return {type: 'string', value: source};
    }
    if (!source.endsWith('\'')) {
      return undefined;
    }
    let value = '';
    for (let i = 0; i < source.length; ) {
      const char = source[i];
      switch (char) {
        case '\'':
          if (i < source.length - 1) {
            return undefined;
          }
          ++i;
          break;
        case '\\': {
          if (i + 1 >= source.length - 1) {
            return undefined;
          }
          const nextChar = source[i + 1];
          switch (nextChar) {
            case '\'':
            case '\\':
              value += nextChar;
              break;
            default:
              return undefined;
          }
          i += 2;
          break;
        }
        default:
          value += char;
          ++i;
          break;
      }
    }
    return {type: 'string', value};
  }

  export function resolve(value: VnmarkPropertyValue): string | undefined {
    if (value.type === 'string') {
      const string = value as VnmarkString;
      return string.value;
    }
    return undefined;
  }
}

export interface VnmarkTime extends VnmarkPropertyValue {
  type: 'time';
  value: number;
  unit: 's' | 'ms';
}

export namespace VnmarkTime {
  export function parse(source: string): VnmarkTime | undefined {
    let unit: 's' | 'ms';
    if (source.endsWith('ms')) {
      unit = 'ms';
    } else if (source.endsWith('s')) {
      unit = 's'
    } else {
      return undefined;
    }
    const value = Number(source.substring(0, source.length - unit.length));
    if (Number.isNaN(value)) {
      return undefined;
    }
    return {type: 'time', value, unit};
  }

  export function resolve(value: VnmarkPropertyValue): number | undefined {
    if (value.type == 'time') {
      const time = value as VnmarkTime;
      switch (time.unit) {
        case 's':
          return time.value * 1000;
        case 'ms':
          return time.value;
      }
    }
    return undefined;
  }
}
