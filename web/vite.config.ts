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
    /* Proxy endpoints (use HTTPS) */
    proxy: {
      '/local/widget_wizard/system-stats-ws': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        ws: true,
        changeOrigin: true,
        secure: false
      },
      '/local/widget_wizard/file-upload': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true,
        secure: false
      },
      '/rtsp-over-websocket': {
        target: `wss://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        ws: true,
        secure: false
      },
      '/axis-cgi/': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true,
        secure: false
      },
      '/mjpg/': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true,
        secure: false
      },
      '/img/': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true,
        secure: false
      },
      '/config/rest/': {
        target: `https://${process.env.TARGET_IP}:${process.env.TARGET_PORT}`,
        changeOrigin: true,
        secure: false
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
