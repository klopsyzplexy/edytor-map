import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Przykłady (schemat i modele z examples/) dostępne obok edytora: w trybie dev pod tym samym adresem,
 * a w zbudowanej stronie jako pliki (np. ./schemat-przyklad.json, ./modele/kladka.glb).
 * Nie używamy publicDir, bo kod importuje schemat z examples/, a Vite zabrania importu z publicDir.
 */
function examples(): Plugin {
  const dir = new URL('./examples/', import.meta.url).pathname;
  const files = (d: string): string[] =>
    readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [relative(dir, join(d, f)).split('\\').join('/')]));
  const types: Record<string, string> = { json: 'application/json', glb: 'model/gltf-binary', png: 'image/png', jpg: 'image/jpeg' };
  return {
    name: 'edytor-examples',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '');
        if (!files(dir).includes(path)) return next();
        res.setHeader('Content-Type', types[path.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.end(readFileSync(join(dir, path)));
      });
    },
    generateBundle() {
      for (const f of files(dir)) this.emitFile({ type: 'asset', fileName: f, source: readFileSync(join(dir, f)) });
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [examples()],
  build: { chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
