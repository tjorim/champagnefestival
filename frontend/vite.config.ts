import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }),
    reactPlugin(),
  ],
  css: {
    transformer: "lightningcss",
  },
  build: {
    cssMinify: "lightningcss",
    rolldownOptions: {
      output: {
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true,
          },
        },
        codeSplitting: {
          groups: [
            {
              name: "vendor-ui",
              test: /node_modules[\\/](react-bootstrap|bootstrap)/,
              priority: 4,
            },
            {
              name: "vendor-maps",
              test: /node_modules[\\/](leaflet|react-leaflet)/,
              priority: 3,
            },
            {
              name: "vendor-carousel",
              test: /node_modules[\\/]swiper/,
              priority: 2,
            },
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
