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
      <div
        ref={viewRef}
        style={{
          position: 'relative',
          fontFamily: 'serif',
          width: 1280,
          height: 720,
        }}>
        <canvas
          className="canvas"
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />
        <div
          className="dialogue"
          style={{
            position: 'absolute',
            inset: 0,
          }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 420,
              width: 1280,
              height: 300,
            }}
          />
          <div className="avatar" style={{ position: 'absolute' }} />
          <div
            className="name"
            style={{
              position: 'absolute',
              left: 266,
              top: 570,
              width: 78,
              fontSize: 26,
              lineHeight: '1.5',
            }}
          />
          <div
            className="text"
            style={{
              position: 'absolute',
              left: 340,
              top: 570,
              width: 600,
              fontSize: 26,
              lineHeight: '1.5',
            }}
          />
        </div>
        <div
          className="debug"
          style={{
            position: 'absolute',
            inset: 0,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}></div>
        <div className="pointer" style={{ position: 'absolute', inset: 0 }} />
      </div>
    </>
  );
}

export default App;
