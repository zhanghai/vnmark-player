import {getQuickJS} from 'quickjs-emscripten';
import {useRef} from 'react';

import './App.css';
import {VnmarkEngine} from './vnmark-engine';
import {ZipVnmarkPackage} from './vnmark-package';
import {VnmarkViewController} from './vnmark-view';

function App() {
  const viewRef = useRef<HTMLDivElement>(null);

  const loadVnmZip = async (file: File) => {
    const package_ = await ZipVnmarkPackage.read(file);
    const quickJs = await getQuickJS();
    const viewController = new VnmarkViewController();
    await viewController.mount(viewRef.current!, package_.manifest);
    const engine = new VnmarkEngine(
      package_,
      quickJs,
      (engine, options) => viewController.update(engine, options)
    );
    await engine.execute();
  };

  return (
    <>
      <div>
        <input type="file" onChange={event => {
          const file = event.target.files!.item(0);
          if (file) {
            loadVnmZip(file);
          }
        }}/>
      </div>
      <div ref={viewRef}/>
    </>
  )
}

export default App;
