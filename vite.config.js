import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

// The geometry worker always receives its embedded WASM bytes. Use the
// browser branch of Emscripten's universal loader, including on file://
// (as in SlotForge Foundry).
const browserKernel = () => ({
  name: 'offline-manifold-worker',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/manifold-3d/manifold.js')) return;
    return code
      .replace('await import("node:module")', '({})')
      .replaceAll('import.meta.url', 'globalThis.location.href');
  },
});

export default defineConfig({
  define: { __FRAME_VERSION__: JSON.stringify(version) },
  // One offline page (dist/index.html) that the desktop shell shows.
  plugins: [browserKernel(), viteSingleFile({ removeViteModuleLoader: true })],
  optimizeDeps: { include: ['manifold-3d'] },
  worker: { format: 'iife', plugins: () => [browserKernel()] },
  build: { target: 'es2022', chunkSizeWarningLimit: 12000 },
  server: { port: 5191, strictPort: true },
});
