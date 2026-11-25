import Module from 'manifold-3d';
import wasmURL from 'manifold-3d/manifold.wasm?url&inline';
import { createEngine } from './engine.js';

// The geometry engine in its own thread, so the window stays responsive.
const ready = (async () => {
  const wasmBinary = await (await fetch(wasmURL)).arrayBuffer();
  const wasm = await Module({ wasmBinary, locateFile: () => wasmURL });
  wasm.setup();
  postMessage({ ready: true });
  return createEngine(wasm);
})();
ready.catch((e) => postMessage({ failed: e?.message ?? String(e) }));

onmessage = async ({ data }) => {
  const { id, method, args } = data;
  try {
    const engine = await ready;
    const value = engine[method](args);
    const transfers = [];
    for (const part of [value?.chassis, value?.pod]) if (part) transfers.push(part.positions.buffer, part.indices.buffer);
    postMessage({ id, value }, transfers);
  } catch (e) {
    postMessage({ id, error: e?.message ?? String(e) });
  }
};
