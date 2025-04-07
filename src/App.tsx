import './App.css';

import { getQuickJS } from 'quickjs-emscripten';
import { useRef } from 'react';

import { Engine } from './engine';
import { FileSystemPackage } from './package';
import { View } from './view';

function App() {
  const viewRef = useRef<HTMLDivElement>(null);

  // const loadVnmZip = async (file: File) => {
  // const package_ = await ZipPackage.read(file);
  const loadVnmDirectory = async (directory: FileSystemDirectoryHandle) => {
    const package_ = await FileSystemPackage.read(directory);
    const quickJs = await getQuickJS();
    const engine = new Engine(package_, quickJs);
    const view = new View(viewRef.current!, engine);
    await view.init();
    try {
      await engine.execute();
    } finally {
      view.destroy();
    }
  };

  return (
    <>
      <div>
        {/*<input*/}
        {/*  type="file"*/}
        {/*  onChange={event => {*/}
        {/*    const file = event.target.files!.item(0);*/}
        {/*    if (file) {*/}
        {/*      loadVnmZip(file);*/}
        {/*    }*/}
        {/*  }}*/}
        {/*/>*/}
        <button
          onClick={async event => {
            event.preventDefault();
            // @ts-expect-error TS2339
            await loadVnmDirectory(await window.showDirectoryPicker());
          }}>
          Open directory
        </button>
      </div>
      <div ref={viewRef} />
    </>
  );
}

export default App;
