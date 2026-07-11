import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJsonOrThrow, requestApi } from "./adminApi";

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
});
