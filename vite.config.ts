import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/xcdemon-proxy': {
        target: 'https://xcdemon.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/xcdemon-proxy/, ''),
      },
      '/xcdemon-www-proxy': {
        target: 'https://www.xcdemon.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/xcdemon-www-proxy/, ''),
      },
    },
  },
});
