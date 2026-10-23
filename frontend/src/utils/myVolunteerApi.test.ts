import { http, HttpResponse } from "msw/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import {
  getMyVolunteerIdentity,
  registerMyVolunteerIdentity,
  updateMyEidDocumentNumber,
} from "./myVolunteerApi";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const VOLUNTEER = "/api/me/volunteer";
const REGISTER = "/api/me/volunteer/register";
const EID_CORRECTION = "/api/me/volunteer/eid-correction";

/** Answers one route and records the requests it received (body already read as JSON). */
function serve(
  method: "get" | "post",
  path: string,
  respond: () => Response,
): { request: Request; body: unknown }[] {
  const received: { request: Request; body: unknown }[] = [];
  server.use(
    http[method](path, async ({ request }) => {
      const body = method === "post" ? await request.clone().json() : undefined;
      received.push({ request, body });
      return respond();
    }),
  );
  return received;
}

describe("getMyVolunteerIdentity", () => {
  it("sends the bearer token and parses a linked identity", async () => {
    const received = serve("get", VOLUNTEER, () =>
      HttpResponse.json({
        linked: true,
        name: "Sofie De Smet",
        national_register_number: "91010112345",
        eid_document_number: "BEX123456",
      }),
    );

    const identity = await getMyVolunteerIdentity("token-1");

    expect(received).toHaveLength(1);
    expect(received[0]!.request.headers.get("authorization")).toBe("Bearer token-1");
    expect(identity).toEqual({
      linked: true,
      name: "Sofie De Smet",
      nationalRegisterNumber: "91010112345",
      eidDocumentNumber: "BEX123456",
    });
  });

  it("parses an unlinked identity as all-null", async () => {
    serve("get", VOLUNTEER, () => HttpResponse.json({ linked: false }));

    const identity = await getMyVolunteerIdentity("token-1");

    expect(identity).toEqual({
      linked: false,
      name: null,
      nationalRegisterNumber: null,
      eidDocumentNumber: null,
    });
  });

  it("throws on a failed response", async () => {
    serve("get", VOLUNTEER, () => HttpResponse.json({}, { status: 500 }));

    await expect(getMyVolunteerIdentity("token-1")).rejects.toThrow();
  });
});

describe("registerMyVolunteerIdentity", () => {
  it("posts name/NISS/eID and returns the linked identity", async () => {
    const received = serve("post", REGISTER, () =>
      HttpResponse.json({
        linked: true,
        name: "Sofie De Smet",
        national_register_number: "91010112319",
        eid_document_number: "123456789002",
      }),
    );

    const identity = await registerMyVolunteerIdentity("token-1", {
      name: "Sofie De Smet",
      nationalRegisterNumber: "91010112319",
      eidDocumentNumber: "123456789002",
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.request.headers.get("authorization")).toBe("Bearer token-1");
    expect(received[0]!.request.headers.get("content-type")).toBe("application/json");
    expect(received[0]!.body).toEqual({
      name: "Sofie De Smet",
      national_register_number: "91010112319",
      eid_document_number: "123456789002",
    });
    expect(identity.linked).toBe(true);
  });

  it("surfaces the server's detail message on conflict", async () => {
    serve("post", REGISTER, () =>
      HttpResponse.json(
        { detail: "This identity is already linked to another account." },
        { status: 409 },
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
    serve("post", REGISTER, () => HttpResponse.json({}, { status: 422 }));

    await expect(
      registerMyVolunteerIdentity("token-1", {
        name: "Someone",
        nationalRegisterNumber: "00000000000",
        eidDocumentNumber: "000000000000",
      }),
    ).rejects.toThrow();
  });
});

describe("updateMyEidDocumentNumber", () => {
  it("posts the new eID number and returns the updated identity", async () => {
    const received = serve("post", EID_CORRECTION, () =>
      HttpResponse.json({
        linked: true,
        name: "Sofie De Smet",
        national_register_number: "91010112319",
        eid_document_number: "123456789103",
      }),
    );

    const identity = await updateMyEidDocumentNumber("token-1", "123456789103");

    expect(received).toHaveLength(1);
    expect(received[0]!.request.headers.get("authorization")).toBe("Bearer token-1");
    expect(received[0]!.request.headers.get("content-type")).toBe("application/json");
    expect(received[0]!.body).toEqual({ eid_document_number: "123456789103" });
    expect(identity.eidDocumentNumber).toBe("123456789103");
  });

  it("throws when the volunteer isn't linked yet", async () => {
    serve("post", EID_CORRECTION, () =>
      HttpResponse.json(
        { detail: "Your account isn't linked to a volunteer record yet." },
        { status: 404 },
      ),
    );

    await expect(updateMyEidDocumentNumber("token-1", "123456789103")).rejects.toThrow(
      "Your account isn't linked to a volunteer record yet.",
    );
  });

  it("throws when the checksum is rejected", async () => {
    serve("post", EID_CORRECTION, () =>
      HttpResponse.json(
        { detail: "That eID document number doesn't look valid. Please check it and try again." },
        { status: 422 },
      ),
    );

    await expect(updateMyEidDocumentNumber("token-1", "999999999999")).rejects.toThrow(
      "doesn't look valid",
    );
  });
});
