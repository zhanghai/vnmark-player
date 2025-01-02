import {VnmarkManifest} from './VnmarkManifest';

export interface VnmarkPackage {
  readonly manifest: VnmarkManifest;

  // Paths of files.
  readonly files: string[];

  // Paths of directories to paths of their children.
  readonly directories: Map<string, string[]>;

  getBlob(file: string): Blob | undefined;
}
