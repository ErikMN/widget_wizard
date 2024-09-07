import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/local/widget_wizard',
  build: {
    outDir: 'build',
    assetsDir: 'static',
    sourcemap: false
  },
  server: {
    port: 8080,
    open: true,
    proxy: {
      '/rtsp-over-websocket': {
        target: `ws://${process.env.TARGET_IP}`,
        ws: true
      },
      '/axis-cgi/': {
        target: `http://${process.env.TARGET_IP}`,
        changeOrigin: true
      }
    }
  },
  plugins: [
    react(),
    viteTsconfigPaths(),
    svgr({
      include: '**/*.svg?react'
    }),
    // https://www.npmjs.com/package/vite-plugin-compression2
    compression({ deleteOriginalAssets: true, exclude: [/\.html$/] })
  ]
});
