import {MANIFEST_FILE, Manifest} from './Manifest';
import {PackageError, Package} from './Package';

export class FileSystemPackage extends Package {
  readonly files: string[];

  private constructor(
    readonly manifest: Manifest,
    readonly fileObjects: Map<string, File>,
    readonly directories: Map<string, string[]>,
  ) {
    super();
    this.files = Array.from(fileObjects.keys());
  }

  getBlobForFile(file: string): Blob | undefined {
    return this.fileObjects.get(file);
  }

  static async read(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemPackage> {
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

    const manifestFile = fileObjects.get(MANIFEST_FILE);
    if (!manifestFile) {
      throw new PackageError(`Missing manifest file "${MANIFEST_FILE}"`);
    }
    const manifestText = await manifestFile.text();
    const manifest = Manifest.parse(manifestText);

    return new FileSystemPackage(manifest, fileObjects, directories);
  }
}
