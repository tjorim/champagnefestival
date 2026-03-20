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
        name: "cloudflare-analytics",
        transformIndexHtml(html) {
          const token = env.VITE_CF_BEACON_TOKEN;
          if (!token) {
            return html;
          }
          // Validate token is a 32-character hex string before injecting into HTML
          if (!/^[0-9a-f]{32}$/i.test(token)) {
            console.warn(
              `[cloudflare-analytics] VITE_CF_BEACON_TOKEN must be a 32-character hex string — analytics script not injected.`,
            );
            return html;
          }
          // Regex ensures the token is pure hex — no HTML-special characters possible
          return html.replace(
            "</head>",
            `  <script defer src="https://static.cloudflare.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>\n  </head>`,
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
