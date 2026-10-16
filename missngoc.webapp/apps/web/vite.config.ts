import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Dùng thẳng mã nguồn TypeScript của package dùng chung
      '@missngoc/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // host: true để điện thoại trong cùng Wi-Fi mở được trang dev, ví dụ http://192.168.1.10:5173
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
