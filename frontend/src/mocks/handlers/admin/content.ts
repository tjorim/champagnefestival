import { jsonResponse } from "../../response";
import { http } from "msw/http";
import {
  seedAuditEntries,
  seedContactMessages,
  seedEmailCategories,
  seedFaqItems,
  seedPrivacyPolicy,
  seedWaitlistEntries,
} from "../../data/adminContent";
import { requireAuth } from "./auth";

export const contentHandlers = [
  // The announcements panel mounts before the signage editor tab is selected.
  http.get("/api/announcements", ({ request }) => {
    const authError = requireAuth(request);
    return authError ?? jsonResponse<import("@/api-types").AnnouncementOut[]>([]);
  }),

  /** Read-only queue and content screens: seeded lists so the admin sweep renders real states. */
  http.get(
    "/api/waitlist",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").WaitlistEntryListEnvelope>({
        items: seedWaitlistEntries,
        total: seedWaitlistEntries.length,
        limit: 50,
        page: 1,
      }),
  ),
  http.get(
    "/api/waitlist/scopes",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").WaitlistScopes>({
        events: [{ id: "event-1", title: "Champagne dinner", outstanding: 1, total: 1 }],
        products: [
          {
            id: "product-1",
            name: "Tasting menu",
            event_id: "event-1",
            event_title: "Champagne dinner",
            outstanding: 1,
            total: 1,
          },
        ],
      }),
  ),
  http.get(
    "/api/contact",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").ContactMessageListEnvelope>({
        items: seedContactMessages,
        total: seedContactMessages.length,
        limit: 50,
        page: 1,
      }),
  ),
  http.get(
    "/api/editions/:id/scratchpad",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").EditionScratchpadOut>({
        content: "",
        updated_at: "2026-01-01T00:00:00Z",
      }),
  ),
  http.get(
    "/api/faq",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").FaqItemOut[]>(seedFaqItems),
  ),
  http.get(
    "/api/email-categories",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").EmailCategoryOut[]>(seedEmailCategories),
  ),
  http.get(
    "/api/policies/:key",
    ({ request }) =>
      requireAuth(request) ?? jsonResponse<import("@/api-types").PolicyOut>(seedPrivacyPolicy),
  ),
  http.get(
    "/api/audit/resource-types",
    ({ request }) => requireAuth(request) ?? jsonResponse<string[]>(["event", "registration"]),
  ),
  http.get(
    "/api/audit/actions",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<string[]>([...new Set(seedAuditEntries.map((entry) => entry.action))]),
  ),
  http.get(
    "/api/audit/actors",
    ({ request }) =>
      requireAuth(request) ??
      jsonResponse<import("@/api-types").AuditActorOut[]>(
        seedAuditEntries.map(({ actor, actor_label }) => ({ actor, actor_label })),
      ),
  ),
  http.get("/api/audit", ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const entries = seedAuditEntries.filter((entry) =>
      (["action", "actor", "resource_type", "resource_id"] as const).every(
        (field) => !searchParams.has(field) || entry[field] === searchParams.get(field),
      ),
    );
    return jsonResponse<import("@/api-types").AuditEntryOut[]>(entries);
  }),
  /** POST /api/push/test — admin-only test send (#941). */
  http.post("/api/push/test", async ({ request }) => {
    const authError = requireAuth(request);
    if (authError) return authError;
    const body = (await request.json()) as { subscription_id: string };
    return jsonResponse<import("@/api-types").PushTestQueuedOut>(
      { queued: true, job_id: `mock-job-${body.subscription_id}` },
      { status: 202 },
    );
  }),
];
