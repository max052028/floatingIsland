import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build can be hosted from any sub-path (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 1000 },
});
