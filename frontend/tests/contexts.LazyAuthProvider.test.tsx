import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextProps } from "react-oidc-context";
import { OIDC_USER_STORAGE_KEY } from "@/config/oidc";
import { LazyAuthProvider } from "@/contexts/LazyAuthProvider";
import { useAuth } from "@/contexts/AuthContext";

vi.unmock("@/contexts/AuthContext");
const runtime = vi.hoisted(() => ({
  mounts: 0,
  signinRedirect: vi.fn().mockResolvedValue(undefined),
  signinSilent: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/contexts/OidcRuntime", () => ({
  default: ({ onReady }: { onReady: (auth: AuthContextProps) => void }) => {
    useEffect(() => {
      runtime.mounts++;
      onReady({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        signinRedirect: runtime.signinRedirect,
        signinSilent: runtime.signinSilent,
      } as unknown as AuthContextProps);
    }, [onReady]);
    return null;
  },
}));
function Consumer() {
  const auth = useAuth();
  const [draft, setDraft] = useState("");
  return (
    <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span>{auth.accountLabel ?? "Signed out"}</span>
      <button onClick={() => auth.login("/me", { loginHint: "guest@example.com" })}>Sign in</button>
      <button onClick={() => void auth.renewSession()}>Renew</button>
    </>
  );
}
let onNavigate: (path: string) => void;
function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LazyAuthProvider
        navigateTo={vi.fn()}
        subscribe={(callback) => {
          onNavigate = callback;
          return () => {};
        }}
      >
        <Consumer />
      </LazyAuthProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  history.replaceState(null, "", "/");
  localStorage.clear();
  runtime.mounts = 0;
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("lazy OIDC runtime", () => {
  it("keeps anonymous landing visits light, then forwards sign-in without resetting a draft", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "unfinished booking" } });
    expect(runtime.mounts).toBe(0);
    fireEvent.click(screen.getByText("Sign in"));
    await waitFor(() =>
      expect(runtime.signinRedirect).toHaveBeenCalledWith({
        state: { returnTo: "/me" },
        login_hint: "guest@example.com",
      }),
    );
    expect(screen.getByLabelText("Draft")).toHaveValue("unfinished booking");
  });
  it("loads on renewal", async () => {
    mount();
    fireEvent.click(screen.getByText("Renew"));
    await waitFor(() => expect(runtime.signinSilent).toHaveBeenCalledOnce());
  });
  it.each(["/admin", "/check-in", "/venue-plan", "/me", "/pebble-pair"])(
    "loads on client navigation to %s",
    async (path) => {
      mount();
      act(() => onNavigate(path));
      await waitFor(() => expect(runtime.mounts).toBe(1));
    },
  );
  it("uses the stored identity on the first render while loading renewal support", () => {
    localStorage.setItem(
      OIDC_USER_STORAGE_KEY,
      JSON.stringify({
        access_token: "token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        profile: { sub: "visitor", name: "Returning visitor" },
      }),
    );
    mount();
    expect(screen.getByText("Returning visitor")).toBeInTheDocument();
  });
  it("treats malformed storage as signed out", () => {
    localStorage.setItem(OIDC_USER_STORAGE_KEY, "not json");
    mount();
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(runtime.mounts).toBe(0);
  });
});
