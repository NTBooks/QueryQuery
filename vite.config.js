import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React client lives in client/. We build it to dist/ which Express serves
// in production. In development, Vite runs its own dev server and proxies the
// JSON API to the Express server (which dev runs on port 4711).
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': 'http://localhost:4711',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
