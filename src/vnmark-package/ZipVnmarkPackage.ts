import {BlobReader, Entry, ZipReader} from '@zip.js/zip.js';

import {VnmarkPackage} from './VnmarkPackage';
import {VNMARK_MANIFEST_FILE, VnmarkManifest, VnmarkManifestError} from './VnmarkManifest';

export class ZipVnmarkPackageError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class ZipVnmarkPackage implements VnmarkPackage {
  readonly files: string[];

  private constructor(
    readonly blob: Blob,
    readonly manifest: VnmarkManifest,
    readonly entries: Map<string, Entry>,
    readonly directories: Map<string, string[]>,
  ) {
    this.files = Array.from(entries.keys());
  }

  static async read(blob: Blob): Promise<ZipVnmarkPackage> {
    const zipReader = new ZipReader(new BlobReader(blob));
    const entries = await zipReader.getEntries();
    for (const entry of entries) {
      if (entry.directory) {
        throw new ZipVnmarkPackageError(`Unsupported directory entry "${entry.filename}"`);
      }
      if (entry.compressionMethod !== 0) {
        throw new ZipVnmarkPackageError(`Unsupported compressed entry "${entry.filename}"`);
      }
      if (entry.encrypted) {
        throw new ZipVnmarkPackageError(`Unsupported encrypted entry "${entry.filename}"`);
      }
      if (entry.rawExtraField.length !== 0) {
        throw new ZipVnmarkPackageError(`Unsupported entry with extra field "${entry.filename}"`);
      }
    }
    const fileToEntries = new Map<string, Entry>();
    const directories = new Map<string, string[]>();
    for (const entry of entries) {
      const names = entry.filename.split('/').filter(it => it && it !== '.');
      if (names.includes('..')) {
        throw new ZipVnmarkPackageError(`Invalid entry file name ${entry.filename}`);
      }
      const file = names.join('/');
      if (fileToEntries.has(file)) {
        throw new ZipVnmarkPackageError(`Duplicate entry "${entry.filename}"`);
      }
      fileToEntries.set(file, entry);
      const lastIndexOfSlash = file.lastIndexOf('/');
      const parentDirectory = lastIndexOfSlash != -1 ? file.substring(0, lastIndexOfSlash) : '.';
      if (fileToEntries.has(parentDirectory)) {
        throw new ZipVnmarkPackageError(`Conflicting entry "${entry.filename}"`);
      }
      let parentDirectoryChildren = directories.get(parentDirectory);
      if (!parentDirectoryChildren) {
        parentDirectoryChildren = [];
        directories.set(parentDirectory, parentDirectoryChildren);
      }
      parentDirectoryChildren.push(file);
    }

    const manifestBlob = ZipVnmarkPackage.getBlob(blob, fileToEntries, VNMARK_MANIFEST_FILE);
    if (!manifestBlob) {
      throw new VnmarkManifestError(`Missing manifest file "${VNMARK_MANIFEST_FILE}"`);
    }
    const manifestText = await manifestBlob.text();
    const manifest = VnmarkManifest.parse(manifestText);

    return new ZipVnmarkPackage(blob, manifest, fileToEntries, directories);
  }

  getBlob(file: string): Blob | undefined {
    return ZipVnmarkPackage.getBlob(this.blob, this.entries, file);
  }

  static getBlob(blob: Blob, entries: Map<string, Entry>, file: string): Blob | undefined {
    const entry = entries.get(file);
    if (!entry) {
      return;
    }
    // Assume that the local header has the same file name as in the central header and no extra
    // field, in order to avoid reading the local header.
    const dataOffset = entry.offset + 30 + entry.rawFilename.length;
    return blob.slice(dataOffset, dataOffset + entry.compressedSize);
  }
}
