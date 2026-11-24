import { jsonResponse } from "../../response";
import type { StampCard, StampCardType } from "@/lib/editions/stampCards";
import { http, HttpResponse } from "msw/http";
import { stampTypes, stampCards, setStampTypes, setStampCards } from "./state";
import { requireAuth } from "./auth";

export const stampCardHandlers = [
  http.get(
    "/api/stamp-cards/types",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").StampCardTypeOut[]>(stampTypes),
  ),
  http.post("/api/stamp-cards/types", async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const type = { ...((await request.json()) as StampCardType), id: crypto.randomUUID() };
    stampTypes.push(type);
    return jsonResponse<import("@/api-types").StampCardTypeOut>(type, { status: 201 });
  }),
  http.put("/api/stamp-cards/types/:id", async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const type = { ...((await request.json()) as StampCardType), id: String(params.id) };
    setStampTypes(stampTypes.map((current) => (current.id === params.id ? type : current)));
    return jsonResponse<import("@/api-types").StampCardTypeOut>(type);
  }),
  http.get("/api/stamp-cards/people/:id", ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonResponse<import("@/api-types").StampCardOut[]>(
      stampCards.filter((card) => card.person_id === params.id),
    );
  }),
  http.put("/api/stamp-cards/rewards/:id", async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = (await request.json()) as { handed_out: boolean };
    const reward = stampCards.find((card) => card.reward?.id === params.id)?.reward;
    if (!reward) return HttpResponse.json({}, { status: 404 });
    reward.handed_out_at = body.handed_out ? new Date().toISOString() : null;
    return jsonResponse<import("@/api-types").StampRewardOut>(reward);
  }),
  // Browser tests seed card history explicitly; normal mock lists remain unchanged.
  http.post("/api/mock/stamp-cards", async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    setStampCards((await request.json()) as StampCard[]);
    return HttpResponse.json({ ok: true });
  }),
];
