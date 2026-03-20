import { paraglideVitePlugin } from "@inlang/paraglide-js";
import reactPlugin from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
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
      {
        name: "analytics",
        transformIndexHtml(html) {
          if (!env.VITE_UMAMI_SCRIPT_URL || !env.VITE_UMAMI_WEBSITE_ID) {
            return html;
          }
          return html.replace(
            "</head>",
            `  <script defer src="${env.VITE_UMAMI_SCRIPT_URL}" data-website-id="${env.VITE_UMAMI_WEBSITE_ID}"></script>\n  </head>`,
          );
        },
      },
    ],
    css: {
      transformer: "lightningcss",
    },
    build: {
      cssMinify: "lightningcss",
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          chunkFileNames: "assets/js/[name]-[hash].js",
          entryFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react") || id.includes("react-dom")) {
                return "vendor-react";
              }
              if (id.includes("react-bootstrap") || id.includes("bootstrap")) {
                return "vendor-ui";
              }
              if (id.includes("leaflet")) {
                return "vendor-maps";
              }
              if (id.includes("swiper")) {
                return "vendor-carousel";
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
  };
});
