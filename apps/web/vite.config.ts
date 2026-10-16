import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal web-shell build config. The new business domain re-adds plugins
// (PWA, proxies, Capacitor CORS, etc.) as it needs them.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
