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
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Check more specific patterns before generic "react" to avoid
            // react-bootstrap, react-leaflet, etc. landing in vendor-react
            if (id.includes("react-bootstrap") || id.includes("bootstrap")) {
              return "vendor-ui";
            }
            if (id.includes("leaflet")) {
              return "vendor-maps";
            }
            if (id.includes("swiper")) {
              return "vendor-carousel";
            }
            if (id.includes("react")) {
              return "vendor-react";
            }
          }
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
