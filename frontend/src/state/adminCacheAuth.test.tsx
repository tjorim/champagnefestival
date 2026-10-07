import "fake-indexeddb/auto";
import { act, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { OIDC_USER_STORAGE_KEY } from "@/config/oidc";
import { AdminCacheStorage } from "./adminCacheStorage";
import { adminCachePersistence, ADMIN_CACHE_WIPE_SIGNAL } from "./adminCachePersistence";
const { AuthProvider, useAuth } =
  await vi.importActual<typeof import("@/contexts/AuthContext")>("@/contexts/AuthContext");

function Consumer() {
  const auth = useAuth();
  return (
    <>
      <button onClick={auth.logout}>Sign out</button>
      {auth.authError && <p role="alert">{auth.authError}</p>}
    </>
  );
}
function session(roles: string[], isAuthenticated = true) {
  const removeUser = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useOidcAuth).mockReturnValue({
    isAuthenticated,
    isLoading: false,
    user: { profile: { sub: "user", realm_access: { roles } }, access_token: "token" },
    removeUser,
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useOidcAuth>);
  return removeUser;
}
afterEach(async () => {
  cleanup();
  await new AdminCacheStorage().remove();
});

describe("app-level persisted session ownership", () => {
  it.each([null, ADMIN_CACHE_WIPE_SIGNAL, OIDC_USER_STORAGE_KEY])(
    "ignores storage event %s for public sessions",
    async (key) => {
      const client = new QueryClient();
      const removeUser = session(["visitor"]);
      render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <Consumer />
          </AuthProvider>
        </QueryClientProvider>,
      );
      await screen.findByRole("button");
      const wipe = vi.spyOn(adminCachePersistence(client), "wipe");
      wipe.mockClear();
      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
      });
      expect(removeUser).not.toHaveBeenCalled();
      expect(wipe).not.toHaveBeenCalled();
      wipe.mockRestore();
      await adminCachePersistence(client).wipe();
      client.clear();
    },
  );
  it("wipes on role loss with no dashboard mounted", async () => {
    const client = new QueryClient();
    session(["admin"]);
    const tree = () => (
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );
    const view = render(tree());
    await screen.findByRole("button");
    client.setQueryData(["admin", "tables"], [{ id: "table" }]);
    await vi.waitFor(async () => expect(await new AdminCacheStorage().read()).toBeTruthy(), {
      timeout: 2000,
    });
    session(["manager"]);
    view.rerender(tree());
    await vi.waitFor(async () => expect(await new AdminCacheStorage().read()).toBeUndefined());
    expect(client.getQueryData(["admin", "tables"])).toBeUndefined();
    await adminCachePersistence(client).wipe();
    client.clear();
  });
  it("a second tab's sign-out wipes and removes the local OIDC user", async () => {
    const client = new QueryClient();
    const removeUser = session(["volunteer"]);
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("button");
    client.setQueryData(["admin", "tables"], [{ id: "table" }]);
    await vi.waitFor(async () => expect(await new AdminCacheStorage().read()).toBeTruthy(), {
      timeout: 2000,
    });
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: ADMIN_CACHE_WIPE_SIGNAL, newValue: "other-tab" }),
      );
    });
    await vi.waitFor(async () => expect(await new AdminCacheStorage().read()).toBeUndefined());
    expect(removeUser).toHaveBeenCalled();
    expect(client.getQueryData(["admin", "tables"])).toBeUndefined();
    await adminCachePersistence(client).wipe();
    client.clear();
  });
  it("wipes when the current token expires without a dashboard or OIDC state update", async () => {
    const client = new QueryClient();
    const removeUser = session(["admin"]);
    const mockState = vi.mocked(useOidcAuth)();
    mockState.user!.expires_at = Date.now() / 1000 + 0.3;
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("button");
    client.setQueryData(["admin", "tables"], [{ id: "table" }]);
    await new AdminCacheStorage().write({ test: "cached data" }, () => true);
    await vi.waitFor(() => expect(removeUser).toHaveBeenCalled());
    await vi.waitFor(async () => expect(await new AdminCacheStorage().read()).toBeUndefined());
    expect(client.getQueryData(["admin", "tables"])).toBeUndefined();
    await adminCachePersistence(client).wipe();
    client.clear();
  });

  it("keeps the session and cached views when the emailed session cannot be revoked", async () => {
    server.use(
      http.post("/api/visitor-sessions/sign-out", () => new HttpResponse(null, { status: 500 })),
    );
    const client = new QueryClient();
    session(["admin"]);
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>,
    );
    const button = await screen.findByRole("button");
    client.setQueryData(["admin", "tables"], [{ id: "table" }]);
    await act(async () => {
      button.click();
    });
    const { signoutRedirect } = vi.mocked(useOidcAuth).mock.results[0]!.value;
    await screen.findByRole("alert");
    expect(client.getQueryData(["admin", "tables"])).toBeDefined();
    expect(signoutRedirect).not.toHaveBeenCalled();
    await adminCachePersistence(client).wipe();
    client.clear();
  });
});
