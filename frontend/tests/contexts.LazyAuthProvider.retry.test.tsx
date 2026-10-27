import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextProps } from "react-oidc-context";
import { LazyAuthProvider } from "@/contexts/LazyAuthProvider";
import { useAuth } from "@/contexts/AuthContext";

vi.unmock("@/contexts/AuthContext");
const runtime = vi.hoisted(() => ({
  failures: 1,
  signinRedirect: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/contexts/OidcRuntime", () => {
  if (runtime.failures-- > 0) throw new Error("chunk failed to load");
  return {
    default: ({ onReady }: { onReady: (auth: AuthContextProps) => void }) => {
      onReady({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        signinRedirect: runtime.signinRedirect,
      } as unknown as AuthContextProps);
      return null;
    },
  };
});

function Consumer() {
  const auth = useAuth();
  return (
    <>
      <input aria-label="Draft" />
      {auth.authError && <span role="alert">{auth.authError}</span>}
      <button onClick={() => auth.login("/me")}>Sign in</button>
    </>
  );
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("lazy OIDC runtime import failure", () => {
  it("keeps the form mounted, then retries the import on a new sign-in attempt", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LazyAuthProvider navigateTo={vi.fn()} subscribe={() => () => {}}>
          <Consumer />
        </LazyAuthProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "unfinished" } });
    fireEvent.click(screen.getByText("Sign in"));
    await screen.findByRole("alert");
    expect(runtime.signinRedirect).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Draft")).toHaveValue("unfinished");

    fireEvent.click(screen.getByText("Sign in"));
    await waitFor(() => expect(runtime.signinRedirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Draft")).toHaveValue("unfinished");
  });
});
