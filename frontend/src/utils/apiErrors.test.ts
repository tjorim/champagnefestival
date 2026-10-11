import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/paraglide/runtime";
import {
  ApiError,
  apiErrorFromResponse,
  apiErrorMessage,
  codeFromErrorBody,
  hasApiErrorCode,
} from "./apiErrors";

afterEach(() => setLocale("en", { reload: false }));

function jsonResponse(body: unknown, status = 409): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiErrorMessage", () => {
  it("translates a known code instead of showing the English detail", () => {
    const error = new ApiError("Table 'A1' does not have enough remaining seats.", {
      status: 409,
      code: "table_over_capacity",
    });

    setLocale("en", { reload: false });
    expect(apiErrorMessage(error, "Failed to update registration.")).toBe(
      "This table does not have enough remaining seats.",
    );
    setLocale("nl", { reload: false });
    expect(apiErrorMessage(error, "Bijwerken mislukt.")).toBe(
      "Aan deze tafel zijn niet genoeg plaatsen meer vrij.",
    );
    setLocale("fr", { reload: false });
    expect(apiErrorMessage(error, "Échec.")).toBe("Il ne reste pas assez de places à cette table.");
  });

  it("falls back to the translated operation message for an unknown code", () => {
    const error = new ApiError("A brand new English rule.", { status: 400, code: "not_yet_known" });

    expect(apiErrorMessage(error, "Failed to update registration.")).toBe(
      "Failed to update registration.",
    );
  });

  it("falls back when the error has no code or is not an ApiError", () => {
    expect(apiErrorMessage(new ApiError("Boom", { status: 500 }), "Fallback")).toBe("Fallback");
    expect(apiErrorMessage(new Error("Failed to fetch"), "Fallback")).toBe("Fallback");
    expect(apiErrorMessage("session_expired", "Fallback")).toBe("Fallback");
    expect(apiErrorMessage(undefined, "Fallback")).toBe("Fallback");
  });

  it("matches the code the backend sends for a missing pebble token", () => {
    const error = new ApiError("Invalid or revoked Pebble token", {
      status: 401,
      code: "pebble_token_invalid",
    });

    expect(apiErrorMessage(error, "Fallback")).toBe(
      "This Pebble pairing is no longer valid. Pair your watch again.",
    );
  });
});

describe("hasApiErrorCode", () => {
  it("only matches an ApiError carrying that code", () => {
    const error = new ApiError("x", { status: 409, code: "table_over_capacity" });

    expect(hasApiErrorCode(error, "table_over_capacity")).toBe(true);
    expect(hasApiErrorCode(error, "rate_limited")).toBe(false);
    expect(hasApiErrorCode(new Error("remaining seats"), "table_over_capacity")).toBe(false);
  });
});

describe("apiErrorFromResponse", () => {
  it("keeps the detail as the message and reads the code and status", async () => {
    const error = await apiErrorFromResponse(
      jsonResponse({ detail: "Registration not found.", code: "registration_not_found" }, 404),
      "Fallback",
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Registration not found.");
    expect(error.status).toBe(404);
    expect(error.code).toBe("registration_not_found");
  });

  it("uses the fallback when the body has no string detail or is not JSON", async () => {
    const validationError = await apiErrorFromResponse(
      jsonResponse({ detail: [{ msg: "field required" }] }, 422),
      "Fallback",
    );
    expect(validationError.message).toBe("Fallback");
    expect(validationError.code).toBeUndefined();

    const html = await apiErrorFromResponse(new Response("<html>", { status: 502 }), "Fallback");
    expect(html.message).toBe("Fallback");
    expect((await apiErrorFromResponse(jsonResponse(null, 500), "Fallback")).message).toBe(
      "Fallback",
    );
  });
});

describe("codeFromErrorBody", () => {
  it("ignores anything that is not a non-empty string", () => {
    expect(codeFromErrorBody({ code: "rate_limited" })).toBe("rate_limited");
    expect(codeFromErrorBody({ code: 42 })).toBeUndefined();
    expect(codeFromErrorBody({ code: "" })).toBeUndefined();
    expect(codeFromErrorBody(null)).toBeUndefined();
  });
});
