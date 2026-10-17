import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy keeps the browser same-origin in dev, so uploaded files served
    // from /uploads and /generated resolve without CORS handling.
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/generated': 'http://localhost:5000',
    },
  },
});
