import { Manifest } from './Manifest';

export class PackageError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export abstract class Package {
  abstract readonly manifest: Manifest;

  // Paths of files.
  abstract readonly files: string[];

  protected abstract getBlobForFile(file: string): Promise<Blob | undefined>;

  async getBlobOrNull(...names: string[]): Promise<Blob | undefined> {
    const file = names.join('/');
    if (file in this.files) {
      return this.getBlobForFile(file);
    } else {
      const exactFile = this.files.find(it => it.startsWith(`${file}.`));
      if (exactFile) {
        return this.getBlobForFile(exactFile);
      }
    }
    return undefined;
  }

  async getBlob(...names: string[]): Promise<Blob> {
    const blob = await this.getBlobOrNull(...names);
    if (!blob) {
      throw new PackageError(`Cannot find file with names "${names}"`);
    }
    return blob;
  }
}
