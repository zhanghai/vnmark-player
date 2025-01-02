import * as Yaml from 'yaml';

export class VnmarkManifestError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export const VNMARK_MANIFEST_FILE = 'manifest.yaml';

export class VnmarkManifest {
  constructor(
    readonly language: string,
    readonly names: Map<string, string>,
    readonly width: number,
    readonly height: number,
    readonly density: number,
    readonly entrypoint: string,
  ) {}

  static parse(source: string): VnmarkManifest {
    const yaml = Yaml.parse(source);
    const language = yaml.language;
    if (typeof language !== 'string') {
      throw new VnmarkManifestError(`Invalid language "${language}"`);
    }
    const name = yaml.name;
    const names = new Map<string, string>();
    if (typeof name === 'string') {
      names.set(language, name);
    } else {
      if (!name || typeof name !== 'object') {
        throw new VnmarkManifestError(`Invalid name "${name}"`);
      }
      for (const [nameLanguage, nameValue] of Object.entries(name)) {
        if (typeof nameValue !== 'string') {
          throw new VnmarkManifestError(`Invalid name "${nameValue}" for language "${nameLanguage}"`);
        }
        names.set(nameLanguage, nameValue);
      }
    }
    const width = yaml.width;
    if (!Number.isInteger(width) || width <= 0) {
      throw new VnmarkManifestError(`Invalid width "${width}"`);
    }
    const height = yaml.height;
    if (!Number.isInteger(height) || height <= 0) {
      throw new VnmarkManifestError(`Invalid height "${height}"`);
    }
    const density = yaml.density;
    if (typeof density !== 'number' || !Number.isFinite(density) || Number.isNaN(density) ||
      density <= 0) {
      throw new VnmarkManifestError(`Invalid density "${density}"`);
    }
    const entrypoint = yaml.entrypoint;
    if (typeof entrypoint !== 'string' || !entrypoint) {
      throw new VnmarkManifestError(`Invalid entrypoint "${entrypoint}"`);
    }
    return new VnmarkManifest(language, names, width, height, density, entrypoint);
  }
}
