// Compile-only checks: success fixtures must reject drift rather than cast a malformed record.
import type {
  OrganizationOut,
  PollQuestionOut,
  PersonOut,
  VolunteerIdentityOut,
  AppSettingsOut,
  VenuePlanOut,
} from "@/api-types";
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

export function checkTestLocalContracts(
  person: PersonOut,
  settings: AppSettingsOut,
  plan: VenuePlanOut,
) {
  // @ts-expect-error Inferring a fixture's own shape would make the contract check meaningless.
  jsonResponse({ id: "incomplete" });
  // @ts-expect-error Even complete bodies require an explicit expected contract.
  jsonResponse(person);
  // @ts-expect-error Person creation responses include required metadata and role fields.
  jsonResponse<PersonOut>({ id: "person", name: "Guest", email: "", phone: "" });
  // @ts-expect-error Unlinked identities still include nullable identity fields.
  jsonResponse<VolunteerIdentityOut>({ linked: false });
  const { updated_at: _updatedAt, ...missingSettingsMetadata } = settings;
  // @ts-expect-error Settings fixtures include their response metadata.
  jsonResponse<AppSettingsOut>(missingSettingsMetadata);
  // @ts-expect-error Browser-installed plan fixtures use the generated nested response too.
  jsonResponse<VenuePlanOut>({ ...plan, layouts: [{ id: "hall" }] });
  // Error bodies stay outside the successful response contract.
  jsonResponse<{ detail: string }>({ detail: "diagnostic" }, { status: 500 });
}
