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
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id: string): string | undefined => {
          if (id.indexOf('node_modules') !== -1) {
            // MUI in own chunk:
            if (id.indexOf('@mui') !== -1) {
              return 'vendor_mui';
            }
            // Rest of vendors in node_modules:
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    open: true,
    /* Proxy endpoints */
    proxy: {
      '/rtsp-over-websocket': {
        target: `ws://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        ws: true
      },
      '/axis-cgi/': {
        target: `http://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true
      },
      '/mjpg/': {
        target: `http://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true
      }
    }
  },
  assetsInclude: ['**/*.oga'],
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
