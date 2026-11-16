import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  // przykładowy schemat i modele są dostępne obok edytora (np. ./schemat-przyklad.json)
  publicDir: 'examples',
  build: { chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
