import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Opt-in local sign-in, confined to the Vite development server. */
export function developmentSession(env: Record<string, string>, enabled: boolean) {
  const token = env.DEV_AUTH_BYPASS_TOKEN;
  if (!enabled || !token) return {};
  const authority =
    env.VITE_OIDC_AUTHORITY ?? "http://localhost:9000/application/o/champagnefestival";
  const clientId = env.VITE_OIDC_CLIENT_ID ?? "champagnefestival";
  const storageKey = `oidc.user:${authority}:${clientId}`;
  // Mirrors e2e/auth.setup.ts and the backend's fixed dev-bypass principal.
  // The real bypass token stays in the server-side proxy configuration.
  const user = {
    id_token: "dev-token",
    access_token: "dev-token",
    token_type: "Bearer",
    scope: "openid profile email",
    profile: {
      sub: "dev-bypass-user",
      preferred_username: "devuser",
      name: "Dev User",
      email: "dev@localhost",
      email_verified: true,
      realm_access: { roles: ["admin", "volunteer"] },
    },
  };
  const json = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
  const seed = `localStorage.setItem(${json(storageKey)}, JSON.stringify({ ...${json(user)}, expires_at: Math.floor(Date.now() / 1000) + 86400 }));`;
  const plugin: Plugin = {
    name: "champagnefestival-dev-session",
    apply: "serve",
    transformIndexHtml(_html, context) {
      if (!context.server || context.filename !== resolve(import.meta.dirname, "../index.html"))
        return;
      return [{ tag: "script", children: seed, injectTo: "head-prepend" }];
    },
  };
  return { plugin, headers: { Authorization: `Bearer ${token}` } };
}
