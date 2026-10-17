import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiErrors";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrow, requestApi, signageOperationErrorMessage } from "./adminApi";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adminApi", () => {
  it("shows a friendly offline message when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(requestApi("/api/admin/check-in", {})).rejects.toThrow(
      "We could not reach the server. Check your internet connection and try again.",
    );
    expect(console.error).toHaveBeenCalledWith("Admin API network request failed", {
      url: "/api/admin/check-in",
      error: expect.any(TypeError),
    });
  });

  it("keeps request IDs out of user-facing API errors and logs them instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: "Registration not found" }), {
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": "application/json", "X-Request-ID": "req-123" },
          }),
        ),
      ),
    );

    await expect(
      fetchJsonOrThrow("/api/admin/registrations/missing", {}, "Try again"),
    ).rejects.toThrow("Registration not found");

    try {
      await fetchJsonOrThrow("/api/admin/registrations/missing", {}, "Try again");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("request-id");
    }
    expect(console.error).toHaveBeenCalledWith("Admin API request failed", {
      requestId: "req-123",
      status: 404,
      statusText: "Not Found",
      detail: "Registration not found",
    });
  });

  it("logs failed API responses even when no request ID is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Bad request" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchJsonOrThrow("/api/admin/registrations", {}, "Try again")).rejects.toThrow(
      "Bad request",
    );
    expect(console.error).toHaveBeenCalledWith("Admin API request failed", {
      requestId: null,
      status: 400,
      statusText: "Bad Request",
      detail: "Bad request",
    });
  });

  it("throws an ApiError carrying the stable code next to the English detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ detail: "Registration not found.", code: "registration_not_found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    const error = await fetchJsonOrThrow("/api/registrations/x", {}, "Fallback").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Registration not found.",
      status: 404,
      code: "registration_not_found",
    });
  });

  it("marks a network failure with its own code so it can be translated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await requestApi("/api/x", {}).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("signage error guidance", () => {
  it("requires reconciliation after an uncertain network response instead of suggesting a retry", () => {
    const fallback = m.signage_channels_error();
    expect(
      signageOperationErrorMessage(
        new ApiError("Failed to fetch", { status: 0, code: "network_error" }),
        fallback,
      ),
    ).toBe(fallback);
  });
  it("keeps translated stable codes and hides unknown diagnostics", () => {
    expect(
      signageOperationErrorMessage(
        new ApiError("private detail", { status: 429, code: "rate_limited" }),
        m.signage_channels_error(),
      ),
    ).toBe(m.api_error_rate_limited());
    expect(
      signageOperationErrorMessage(new Error("private detail"), m.signage_channels_error()),
    ).toBe(m.signage_channels_error());
  });
});
