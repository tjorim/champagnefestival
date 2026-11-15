// Compile-only checks: success fixtures must reject drift rather than cast a malformed record.
import type { OrganizationOut, PollQuestionOut } from "@/api-types";
import { jsonResponse } from "@/mocks/response";

export function checkFixtureContracts(organization: OrganizationOut, question: PollQuestionOut) {
  // @ts-expect-error API booleans cannot be replaced by textual form values.
  jsonResponse<OrganizationOut>({ ...organization, active: "true" });
  const { created_at: _createdAt, ...missingTimestamp } = organization;
  // @ts-expect-error Response timestamps are required, including in mocks.
  jsonResponse<OrganizationOut>(missingTimestamp);
  // @ts-expect-error API counters retain their snake_case names.
  jsonResponse<PollQuestionOut>({ ...question, answeredCount: 1 });
}
