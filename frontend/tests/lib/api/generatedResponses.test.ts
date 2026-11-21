import { jsonResponse } from "@/mocks/response";
import { describe, expect, it } from "vitest";
import { http } from "msw/http";
import type { PollOrdersOut, PollQuestionOut } from "@/api-types";
import { seedOrganizations } from "@/mocks/data/organizations";
import { server } from "@/mocks/server";
import {
  fetchContentSectionItems,
  fetchEditionModalOrganizations,
  fetchPollOrders,
  fetchPollQuestions,
  saveContentSectionItem,
} from "@/lib/api/adminContentApi";

const headers = () => ({ Authorization: "Bearer mock-access-token" });
const question: PollQuestionOut = {
  id: "question",
  edition_id: "edition",
  event_id: null,
  kind: "yes_no",
  title: "Dinner?",
  title_nl: "Dinner?",
  title_fr: null,
  title_en: null,
  description: "",
  description_nl: null,
  description_fr: null,
  description_en: null,
  sort_order: 2,
  closes_at: null,
  closed: false,
  options: [],
  answered_count: 1,
  yes_count: 1,
  no_count: 0,
  people_total: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("generated content responses", () => {
  it("preserves the complete organization and contact projection in both lists", async () => {
    const organizations = seedOrganizations;
    server.use(
      http.get("/api/organizations", () =>
        jsonResponse<import("@/api-types").OrganizationOut[]>(organizations),
      ),
    );
    expect(await fetchContentSectionItems("organizations", headers)).toEqual(organizations);
    expect(await fetchEditionModalOrganizations(headers)).toEqual(organizations);
  });

  it("sends the same organization write and preserves its response metadata", async () => {
    const organization = seedOrganizations[0]!;
    let sent: unknown;
    server.use(
      http.put(`/api/organizations/${organization.id}`, async ({ request }) => {
        sent = await request.json();
        return jsonResponse<import("@/api-types").OrganizationOut>(organization);
      }),
    );
    expect(await saveContentSectionItem("organizations", organization, headers)).toEqual(
      organization,
    );
    expect(sent).toEqual({
      name: organization.name,
      image: organization.image,
      website: organization.website,
      description_nl: organization.description_nl,
      description_fr: organization.description_fr,
      description_en: organization.description_en,
      type: organization.type,
      contact_person_id: organization.contact_person_id,
    });
  });

  it("keeps poll records and answer arrays in their wire shape", async () => {
    const orders: PollOrdersOut = {
      edition_id: "edition",
      questions: [question],
      volunteer_count: 1,
      volunteers: [
        {
          volunteer_id: "volunteer",
          name: "Volunteer",
          note: "",
          answered_question_ids: [question.id],
          selections: [],
          attendance: [{ question_id: question.id, attending: true, people: 2 }],
          choices: [],
          texts: [],
          ratings: [],
        },
      ],
    };
    server.use(
      http.get("/api/poll-questions", () =>
        jsonResponse<import("@/api-types").PollQuestionOut[]>([question]),
      ),
      http.get("/api/poll-questions/orders", () =>
        jsonResponse<import("@/api-types").PollOrdersOut>(orders),
      ),
    );
    expect(await fetchPollQuestions("edition", headers)).toEqual([question]);
    expect(await fetchPollOrders("edition", "nl", headers)).toEqual(orders);
  });
});
