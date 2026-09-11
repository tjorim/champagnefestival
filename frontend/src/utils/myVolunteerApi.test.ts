import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMyVolunteerIdentity,
  registerMyVolunteerIdentity,
  submitEidCorrection,
} from "./myVolunteerApi";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getMyVolunteerIdentity", () => {
  it("sends the bearer token and parses a linked identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        linked: true,
        name: "Sofie De Smet",
        national_register_number: "91010112345",
        eid_document_number: "BEX123456",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const identity = await getMyVolunteerIdentity("token-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/me/volunteer", {
      headers: { Authorization: "Bearer token-1" },
    });
    expect(identity).toEqual({
      linked: true,
      name: "Sofie De Smet",
      nationalRegisterNumber: "91010112345",
      eidDocumentNumber: "BEX123456",
    });
  });

  it("parses an unlinked identity as all-null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ linked: false })));

    const identity = await getMyVolunteerIdentity("token-1");

    expect(identity).toEqual({
      linked: false,
      name: null,
      nationalRegisterNumber: null,
      eidDocumentNumber: null,
    });
  });

  it("throws on a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    await expect(getMyVolunteerIdentity("token-1")).rejects.toThrow();
  });
});

describe("registerMyVolunteerIdentity", () => {
  it("posts name/NISS/eID and returns the linked identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        linked: true,
        name: "Sofie De Smet",
        national_register_number: "91010112319",
        eid_document_number: "123456789002",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const identity = await registerMyVolunteerIdentity("token-1", {
      name: "Sofie De Smet",
      nationalRegisterNumber: "91010112319",
      eidDocumentNumber: "123456789002",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/me/volunteer/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-1" },
      body: JSON.stringify({
        name: "Sofie De Smet",
        national_register_number: "91010112319",
        eid_document_number: "123456789002",
      }),
    });
    expect(identity.linked).toBe(true);
  });

  it("surfaces the server's detail message on conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: "This identity is already linked to another account." }, 409),
        ),
    );

    await expect(
      registerMyVolunteerIdentity("token-1", {
        name: "Someone",
        nationalRegisterNumber: "00000000000",
        eidDocumentNumber: "000000000000",
      }),
    ).rejects.toThrow("This identity is already linked to another account.");
  });

  it("falls back to a generic error when the response has no detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 422)));

    await expect(
      registerMyVolunteerIdentity("token-1", {
        name: "Someone",
        nationalRegisterNumber: "00000000000",
        eidDocumentNumber: "000000000000",
      }),
    ).rejects.toThrow();
  });
});

describe("submitEidCorrection", () => {
  it("posts the correction request in snake_case", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ submitted: true }, 202));
    vi.stubGlobal("fetch", fetchMock);

    await submitEidCorrection("token-1", {
      submissionId: "27d6a186-ded1-45b9-af20-2061bb739436",
      newEidDocumentNumber: "BEX999999",
      note: "Card renewed.",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/me/volunteer/eid-correction", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-1" },
      body: JSON.stringify({
        submission_id: "27d6a186-ded1-45b9-af20-2061bb739436",
        new_eid_document_number: "BEX999999",
        note: "Card renewed.",
      }),
    });
  });

  it("throws when the volunteer isn't linked yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: "Your account isn't linked to a volunteer record yet." }, 404),
        ),
    );

    await expect(
      submitEidCorrection("token-1", {
        submissionId: "27d6a186-ded1-45b9-af20-2061bb739436",
        newEidDocumentNumber: "BEX999999",
        note: "",
      }),
    ).rejects.toThrow("Your account isn't linked to a volunteer record yet.");
  });
});
