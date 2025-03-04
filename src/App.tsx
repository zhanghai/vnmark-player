import './App.css';

import { getQuickJS } from 'quickjs-emscripten';
import { useRef } from 'react';

import { Engine } from './engine';
import { ZipPackage } from './package';
import { View } from './view';

function App() {
  const viewRef = useRef<HTMLDivElement>(null);

  const loadVnmZip = async (file: File) => {
    const package_ = await ZipPackage.read(file);
    const quickJs = await getQuickJS();
    const engine = new Engine(package_, quickJs);
    const view = new View(viewRef.current!, engine);
    await view.init();
    await engine.execute();
  };

  return (
    <>
      <div>
        <input
          type="file"
          onChange={event => {
            const file = event.target.files!.item(0);
            if (file) {
              loadVnmZip(file);
            }
          }}
        />
      </div>
      <div ref={viewRef} />
    </>
  );
}

export default App;
