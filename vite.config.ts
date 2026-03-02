import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
  // Load environment variables based on mode (available via env object if needed)
  const env = loadEnv(mode, process.cwd());

  // Example of using env variables
  console.log(`Building for ${mode} mode with ${env.VITE_PUBLIC_URL || 'default'} as public URL`);

  return {
    plugins: [
      react(),
      // Add visualizer for bundle analysis in analyze mode
      mode === 'analyze' && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        // Set up aliases to match the paths in tsconfig.json
        '@': resolve(__dirname, './src'),
      },
    },

    // Configure the server for development
    server: {
      port: 5173,
      open: true,
      host: true, // Listen on all local IPs
    },

    // Build configuration
    build: {
      outDir: 'dist',
      // Optimize build size with esbuild (faster than terser with minimal compression difference)
      minify: 'esbuild',
      // Generate sourcemaps for easier debugging (only in development)
      sourcemap: mode !== 'production',
      // Simpler chunking strategy for single-page site
      rollupOptions: {
        output: {
          manualChunks: {
            // Framework code (rarely changes)
            framework: ['react', 'react-dom'],
            // UI libraries (bootstrap, i18n)
            ui: ['react-bootstrap', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'],
            // Heavy specialty libraries with limited use
            maps: ['leaflet', 'react-leaflet'],
            carousel: ['swiper', 'swiper/react'],
          },
          // Customize chunk naming format
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
    },

    // Optimize assets
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-bootstrap',
        'i18next',
        'react-i18next',
        'i18next-browser-languagedetector',
        'leaflet',
        'react-leaflet',
        'swiper'
      ],
      esbuildOptions: {
        // Remove console logs in production
        drop: mode === 'production' ? ['console', 'debugger'] : [],
      },
    },

    // Configure environment variables
    // https://vitejs.dev/guide/env-and-mode.html
    envPrefix: ['VITE_', 'REACT_'],

    // Pass some environment values explicitly
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __APP_ENV__: JSON.stringify(mode),
    }
  }
});
