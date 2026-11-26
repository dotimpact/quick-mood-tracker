import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD_VERSION__: JSON.stringify(process.env.BUILD_VERSION ?? 'dev'),
  },
  server: {
    host: true,
    port: 5173,
  },
});
