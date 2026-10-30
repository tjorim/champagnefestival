import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import { msw } from "msw/vite";
import { resolve } from "node:path";
import visualThemes from "./src/config/visualThemes.json" with { type: "json" };
import { defineConfig, loadEnv } from "vite";
import { developmentSession } from "./scripts/dev-session.ts";

export default defineConfig(({ command, mode, isPreview }) => {
  const session = developmentSession(
    loadEnv(mode, import.meta.dirname, ""),
    command === "serve" && !isPreview,
  );
  return {
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "src"),
      },
    },
    plugins: [
      {
        name: "visual-theme-prepaint",
        transformIndexHtml(html) {
          return html.replace("__VISUAL_THEMES__", JSON.stringify(visualThemes));
        },
      },
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["custom-localePath", "localStorage", "preferredLanguage", "baseLocale"],
      }),
      reactPlugin(),
      // Serves /mockServiceWorker.js from the msw package in dev. Nothing imports `virtual:msw`,
      // so the worker script is never emitted into dist.
      msw(),
      tailwindcss(),
      ...(session.plugin ? [session.plugin] : []),
    ],
    build: {
      manifest: true,
      rolldownOptions: {
        output: {
          // Keep the framework cache boundary stable when dependency sharing changes.
          codeSplitting: {
            groups: [
              {
                name: "oidc-vendor",
                // Keep shared React dependencies in their own eager chunk.
                includeDependenciesRecursively: false,
                test: /[/\\]node_modules[/\\](oidc-client-ts|react-oidc-context)[/\\]/,
              },
              {
                name: "react-vendor",
                test: /[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/,
              },
            ],
          },
          minify: {
            compress: {
              dropConsole: true,
            },
          },
        },
      },
    },
    server: {
      port: 5173,
      open: true,
      proxy: {
        "/uploads": "http://localhost:8000",
        "/api": { target: "http://localhost:8000", headers: session.headers },
      },
    },
  };
});
