import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Root directory where index.html is located for the app build
  root: 'demo',
  build: {
    // Output directory relative to project root
    outDir: '../dist-demo',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'demo/index.html'),
    }
  }
});
