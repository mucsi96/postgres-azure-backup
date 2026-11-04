import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Bundles and fonts resolve on the public Blob origin after publication.
  base: './',
  plugins: [react()],
  build: { rollupOptions: { output: { chunkFileNames: 'assets/chunk-[name]-[hash].js' } } },
  server: { proxy: { '/api': 'http://localhost:8160', '/oauth2': 'http://localhost:8160', '/_telemetry': 'http://localhost:8160' } },
});
