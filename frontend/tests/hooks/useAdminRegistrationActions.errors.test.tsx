import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { m } from "@/paraglide/messages";
import { setLocale } from "@/paraglide/runtime";
import { useAdminRegistrationActions } from "@/hooks/useAdminRegistrationActions";

const registrationsQueryKey = ["admin", "registrations", "test"];

function setup(confirmOverCapacity = vi.fn().mockResolvedValue(false)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const setRegistrationError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useAdminRegistrationActions({
        authHeaders: () => ({}),
        queryClient,
        registrationsQueryKey,
        setDetailRegistration: vi.fn(),
        setRegistrationError,
        confirmOverCapacity,
      }),
    { wrapper },
  );
  return { ...hook, setRegistrationError, confirmOverCapacity };
}

beforeEach(() => {
  setLocale("en", { reload: false });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("useAdminRegistrationActions errors", () => {
  it("shows the translation of a known error code, not the English detail", async () => {
    setLocale("nl", { reload: false });
    server.use(
      http.put("/api/registrations/reg-1", () =>
        HttpResponse.json(
          { detail: "Registration not found.", code: "registration_not_found" },
          { status: 404 },
        ),
      ),
    );
    const { result, setRegistrationError } = setup();

    await act(async () => {
      await expect(result.current.handleUpdateStatus("reg-1", "confirmed")).rejects.toThrow();
    });

    expect(setRegistrationError).toHaveBeenCalledWith(
      "Deze inschrijving werd niet gevonden. Mogelijk is ze verwijderd.",
    );
  });

  it("falls back to the translated operation message for an unknown code", async () => {
    setLocale("nl", { reload: false });
    server.use(
      http.put("/api/registrations/reg-1", () =>
        HttpResponse.json(
          { detail: "A brand new English rule.", code: "not_yet_translated" },
          { status: 400 },
        ),
      ),
    );
    const { result, setRegistrationError } = setup();

    await act(async () => {
      await expect(result.current.handleUpdateStatus("reg-1", "confirmed")).rejects.toThrow();
    });

    expect(setRegistrationError).toHaveBeenCalledOnce();
    expect(setRegistrationError).toHaveBeenCalledWith(expect.not.stringContaining("English rule"));
    // The Dutch operation fallback, not the English detail.
    expect(setRegistrationError).toHaveBeenCalledWith(m.admin_error_update_registration());
  });

  it("asks to confirm and retries when the table-capacity code comes back", async () => {
    const calls: Record<string, unknown>[] = [];
    server.use(
      http.put("/api/registrations/reg-1", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push(body);
        if (!body.confirm_over_capacity) {
          return HttpResponse.json(
            {
              detail: "Table 'A1' does not have enough remaining seats.",
              code: "table_over_capacity",
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ id: "reg-1", guest_count: 4 });
      }),
    );
    const confirmOverCapacity = vi.fn().mockResolvedValue(true);
    const { result, setRegistrationError } = setup(confirmOverCapacity);

    await act(async () => {
      await result.current.handleSaveBooking("reg-1", {
        guestCount: 4,
        quantities: {},
        allocations: [],
        notes: "",
        status: "confirmed",
      });
    });

    expect(confirmOverCapacity).toHaveBeenCalledOnce();
    expect(calls.map((body) => body.confirm_over_capacity)).toEqual([false, true]);
    expect(setRegistrationError).not.toHaveBeenCalled();
  });

  it("does not treat English capacity wording without the code as a capacity error", async () => {
    server.use(
      http.put("/api/registrations/reg-1", () =>
        HttpResponse.json({ detail: "Not enough remaining seats." }, { status: 409 }),
      ),
    );
    const confirmOverCapacity = vi.fn().mockResolvedValue(true);
    const { result, setRegistrationError } = setup(confirmOverCapacity);

    await act(async () => {
      await expect(
        result.current.handleSaveBooking("reg-1", {
          guestCount: 4,
          quantities: {},
          allocations: [],
          notes: "",
          status: "confirmed",
        }),
      ).rejects.toThrow();
    });

    expect(confirmOverCapacity).not.toHaveBeenCalled();
    expect(setRegistrationError).toHaveBeenCalledWith("Failed to update registration.");
  });
});
