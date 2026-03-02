import reactPlugin from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/champagnefestival/',
  plugins: [reactPlugin()],
  css: {
    transformer: 'lightningcss',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    cssMinify: 'lightningcss',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('react-bootstrap') || id.includes('bootstrap')) {
              return 'vendor-ui';
            }
            if (id.includes('i18next')) {
              return 'vendor-i18n';
            }
            if (id.includes('leaflet')) {
              return 'vendor-maps';
            }
            if (id.includes('swiper')) {
              return 'vendor-carousel';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
