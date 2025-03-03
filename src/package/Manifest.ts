import * as Yaml from 'yaml';

import {PackageError} from './Package';

export const MANIFEST_FILE = 'manifest.yaml';

export class Manifest {
  constructor(
    readonly language: string,
    readonly names: Map<string, string>,
    readonly width: number,
    readonly height: number,
    readonly density: number,
    readonly entrypoint: string,
  ) {}

  static parse(source: string): Manifest {
    const yaml = Yaml.parse(source);
    const language = yaml.language;
    if (typeof language !== 'string') {
      throw new PackageError(`Invalid language "${language}"`);
    }
    const name = yaml.name;
    const names = new Map<string, string>();
    if (typeof name === 'string') {
      names.set(language, name);
    } else {
      if (!name || typeof name !== 'object') {
        throw new PackageError(`Invalid name "${name}"`);
      }
      for (const [nameLanguage, nameValue] of Object.entries(name)) {
        if (typeof nameValue !== 'string') {
          throw new PackageError(`Invalid name "${nameValue}" for language "${nameLanguage}"`);
        }
        names.set(nameLanguage, nameValue);
      }
    }
    const width = yaml.width;
    if (!Number.isInteger(width) || width <= 0) {
      throw new PackageError(`Invalid width "${width}"`);
    }
    const height = yaml.height;
    if (!Number.isInteger(height) || height <= 0) {
      throw new PackageError(`Invalid height "${height}"`);
    }
    const density = yaml.density;
    if (!Number.isFinite(density) || density <= 0) {
      throw new PackageError(`Invalid density "${density}"`);
    }
    const entrypoint = yaml.entrypoint;
    if (typeof entrypoint !== 'string' || !entrypoint) {
      throw new PackageError(`Invalid entrypoint "${entrypoint}"`);
    }
    return new Manifest(language, names, width, height, density, entrypoint);
  }
}
