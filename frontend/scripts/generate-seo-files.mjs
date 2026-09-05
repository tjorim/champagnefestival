// Regenerates public/robots.txt and public/sitemap.xml from the templates in
// scripts/seo-templates/, substituting %VITE_PUBLIC_URL% the same way index.html's
// own placeholder is filled in by Vite. Keeps both files pointed at the real deployed
// host instead of a hardcoded domain that drifts from it — see AGENTS.md for the
// production URL and .env.production for VITE_PUBLIC_URL.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.env.NODE_ENV || "production";
const env = loadEnv(mode, frontendDir, "VITE_");
const publicUrl = env.VITE_PUBLIC_URL;

if (!publicUrl) {
  throw new Error(`VITE_PUBLIC_URL is not set for mode "${mode}" — cannot generate SEO files`);
}

const files = [
  { template: "robots.txt.template", output: "robots.txt" },
  { template: "sitemap.xml.template", output: "sitemap.xml" },
];

for (const { template, output } of files) {
  const templatePath = join(frontendDir, "scripts", "seo-templates", template);
  const outputPath = join(frontendDir, "public", output);
  const rendered = readFileSync(templatePath, "utf8").replaceAll("%VITE_PUBLIC_URL%", publicUrl);
  writeFileSync(outputPath, rendered);
  console.log(`Generated public/${output} -> ${publicUrl}`);
}
