import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type { HtmlTagDescriptor } from "vite";
import { developmentSession, isLoopback } from "./dev-session";

const index = resolve(import.meta.dirname, "../index.html");
function tags(
  env: Record<string, string>,
  context: { filename: string; server?: object } = { filename: index, server: {} },
) {
  const hook = developmentSession(env, true).plugin?.transformIndexHtml;
  if (typeof hook !== "function") throw new Error("Expected the development HTML hook");
  return Reflect.apply(hook, {}, ["<html><head></head></html>", context]) as
    | HtmlTagDescriptor[]
    | undefined;
}

describe("development browser session", () => {
  it("requires an explicit bypass token and an active development server", () => {
    expect(developmentSession({}, true)).toEqual({});
    expect(developmentSession({ DEV_AUTH_BYPASS_TOKEN: "test-bypass" }, false)).toEqual({});
    expect(developmentSession({ DEV_AUTH_BYPASS_TOKEN: "test-bypass" }, true).plugin?.apply).toBe(
      "serve",
    );
  });

  it("seeds the OIDC dev principal before app startup and keeps the bypass token in the proxy", () => {
    const env = {
      DEV_AUTH_BYPASS_TOKEN: "server-only-test-bypass",
      VITE_OIDC_AUTHORITY: "http://localhost:9000/custom-realm",
      VITE_OIDC_CLIENT_ID: "custom-client",
    };
    const [tag] = tags(env)!;
    expect(tag).toMatchObject({ tag: "script", injectTo: "head-prepend" });
    expect(tag!.children).not.toContain(env.DEV_AUTH_BYPASS_TOKEN);
    const storage = new Map<string, string>();
    runInNewContext(tag!.children as string, {
      localStorage: { setItem: (key: string, value: string) => storage.set(key, value) },
    });
    const user = JSON.parse(
      storage.get("oidc.user:http://localhost:9000/custom-realm:custom-client")!,
    );
    expect(user).toMatchObject({
      access_token: "dev-token",
      profile: { sub: "dev-bypass-user", realm_access: { roles: ["admin", "volunteer"] } },
    });
    expect(user.expires_at).toBeGreaterThan(Date.now() / 1000 + 86_390);
    expect(developmentSession(env, true).headers).toEqual({
      Authorization: "Bearer server-only-test-bypass",
    });
  });

  it("does not inject a session in build/preview contexts or other HTML entries", () => {
    const env = { DEV_AUTH_BYPASS_TOKEN: "test-bypass" };
    expect(tags(env, { filename: index })).toBeUndefined();
    expect(
      tags(env, {
        filename: resolve(import.meta.dirname, "../src/signage/offline-player.html"),
        server: {},
      }),
    ).toBeUndefined();
  });

  it("escapes inline script delimiters in custom OIDC configuration", () => {
    const [tag] = tags({
      DEV_AUTH_BYPASS_TOKEN: "test-bypass",
      VITE_OIDC_CLIENT_ID: "</script><script>",
    })!;
    expect(tag!.children).not.toContain("</script>");
    const storage = new Map<string, string>();
    runInNewContext(tag!.children as string, {
      localStorage: { setItem: (key: string, value: string) => storage.set(key, value) },
    });
    expect([...storage.keys()][0]).toContain("</script><script>");
  });

  it("only serves loopback clients while the bypass proxy is active", () => {
    expect(["127.0.0.1", "::1", "::ffff:127.0.0.1"].every(isLoopback)).toBe(true);
    expect([undefined, "192.168.1.20", "::ffff:192.168.1.20"].some(isLoopback)).toBe(false);
    const hook = developmentSession({ DEV_AUTH_BYPASS_TOKEN: "test-bypass" }, true).plugin
      ?.configureServer;
    if (typeof hook !== "function") throw new Error("Expected the development server hook");
    let guard: (request: object, response: object, next: () => void) => void = () => {};
    Reflect.apply(hook, {}, [{ middlewares: { use: (fn: typeof guard) => (guard = fn) } }]);
    const response = { statusCode: 200, end: (_body: string) => {} };
    let passed = false;
    guard({ socket: { remoteAddress: "192.168.1.20" } }, response, () => (passed = true));
    expect([passed, response.statusCode]).toEqual([false, 403]);
    guard({ socket: { remoteAddress: "127.0.0.1" } }, response, () => (passed = true));
    expect(passed).toBe(true);
  });
});
