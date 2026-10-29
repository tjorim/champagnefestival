import { http, HttpResponse } from "msw/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { ApiError } from "./apiErrors";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrow, requestApi, signageOperationErrorMessage } from "./adminApi";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("adminApi", () => {
  it("shows a friendly offline message when fetch fails", async () => {
    server.use(http.all("/api/admin/check-in", () => HttpResponse.error()));

    await expect(requestApi("/api/admin/check-in", {})).rejects.toThrow(
      "We could not reach the server. Check your internet connection and try again.",
    );
    expect(console.error).toHaveBeenCalledWith("Admin API network request failed", {
      url: "/api/admin/check-in",
      // The DOM implementation decides the error class (happy-dom reports a NetworkError DOMException).
      error: expect.anything(),
    });
  });

  it("does not log a request the caller cancelled as a network failure", async () => {
    server.use(http.all("/api/admin/check-in", () => HttpResponse.error()));
    const controller = new AbortController();
    controller.abort();

    await expect(requestApi("/api/admin/check-in", { signal: controller.signal })).rejects.toThrow(
      "We could not reach the server.",
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps request IDs out of user-facing API errors and logs them instead", async () => {
    server.use(
      http.get("/api/admin/registrations/missing", () =>
        HttpResponse.json(
          { detail: "Registration not found" },
          { status: 404, statusText: "Not Found", headers: { "X-Request-ID": "req-123" } },
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
    server.use(
      http.get("/api/admin/registrations", () =>
        HttpResponse.json({ detail: "Bad request" }, { status: 400, statusText: "Bad Request" }),
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
    server.use(
      http.get("/api/registrations/x", () =>
        HttpResponse.json(
          { detail: "Registration not found.", code: "registration_not_found" },
          { status: 404 },
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
    server.use(http.get("/api/x", () => HttpResponse.error()));

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
