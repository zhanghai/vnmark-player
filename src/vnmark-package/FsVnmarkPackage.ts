import {VnmarkPackage} from './VnmarkPackage';
import {VNMARK_MANIFEST_FILE, VnmarkManifest, VnmarkManifestError} from './VnmarkManifest';

export class FsVnmarkPackage implements VnmarkPackage {
  readonly files: string[];

  private constructor(
    readonly manifest: VnmarkManifest,
    readonly fileObjects: Map<string, File>,
    readonly directories: Map<string, string[]>,
  ) {
    this.files = Array.from(fileObjects.keys());
  }

  getBlob(file: string): Blob | undefined {
    return this.fileObjects.get(file);
  }

  static async read(directoryHandle: FileSystemDirectoryHandle): Promise<FsVnmarkPackage> {
    const fileObjects = new Map<string, File>();
    const directories = new Map<string, string[]>();

    async function readDirectory(directory: string, directoryHandle: FileSystemDirectoryHandle) {
      const directoryChildren: string[] = [];
      directories.set(directory, directoryChildren);
      for await (const handle of directoryHandle.values()) {
        const file = directory !== '.' ? `${directory}/${handle.name}` : handle.name;
        directoryChildren.push(file);
        switch (handle.kind) {
          case 'directory':
            await readDirectory(file, handle as FileSystemDirectoryHandle);
            break;
          case 'file':
            fileObjects.set(file, await (handle as FileSystemFileHandle).getFile());
            break;
        }
      }
    }

    await readDirectory('.', directoryHandle);

    const manifestFile = fileObjects.get(VNMARK_MANIFEST_FILE);
    if (!manifestFile) {
      throw new VnmarkManifestError(`Missing manifest file "${VNMARK_MANIFEST_FILE}"`);
    }
    const manifestText = await manifestFile.text();
    const manifest = VnmarkManifest.parse(manifestText);

    return new FsVnmarkPackage(manifest, fileObjects, directories);
  }
}
