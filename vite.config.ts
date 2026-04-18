import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // xlsx-js-style is ~627 kB (minified) — it's isolated in its own lazy chunk
    // and only loaded when the user clicks "Exporter Excel", so the warning
    // would be misleading. Raise the limit to silence it for this known case.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split xlsx-js-style into a dedicated lazy chunk so the main bundle
          // stays lean (~355 kB). Loaded on demand via dynamic import.
          'vendor-xlsx': ['xlsx-js-style'],
        },
      },
    },
  },
});
