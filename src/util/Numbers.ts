export namespace Numbers {
  export function parseFloatOrThrow(string: string): number {
    const number = Number.parseFloat(string);
    if (Number.isNaN(number)) {
      throw new Error(`Invalid floating pointer number "${string}"`);
    }
    return number;
  }

  export function parseIntOrThrow(string: string, radix?: number): number {
    const number = Number.parseInt(string, radix);
    if (Number.isNaN(number)) {
      throw new Error(`Invalid integer "${string}"`);
    }
    return number;
  }
}
