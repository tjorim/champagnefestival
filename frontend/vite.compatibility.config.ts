import { defineConfig } from "vite";
import base from "./vite.config";

// A native React baseline for compatibility and lab performance comparisons.
// The application's regular Vite config continues to select Redact.
export default defineConfig(async (env) => {
  const config = typeof base === "function" ? await base(env) : await base;
  const plugins = (await Promise.all((config.plugins ?? []).flat(Infinity))).filter(
    (plugin) => plugin && !("name" in plugin && plugin.name.startsWith("redact")),
  );
  return { ...config, cacheDir: "node_modules/.vite-native-compatibility", plugins };
});
