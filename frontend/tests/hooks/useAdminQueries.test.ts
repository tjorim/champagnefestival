import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_RESOURCE_KEYS,
  ADMIN_RESOURCE_KEYS,
  shouldRefetchAdminOnlyResourceQuery,
  shouldRefetchAdminResourceQuery,
} from "@/hooks/useAdminQueries";
import { queryKeys } from "@/utils/queryKeys";

describe("useAdminQueries invalidation rules", () => {
  it("refetches all top-level admin resource keys", () => {
    for (const resource of ADMIN_RESOURCE_KEYS) {
      expect(shouldRefetchAdminResourceQuery(["admin", resource])).toBe(true);
    }
  });

  it("leaves tables to their collection instead of a standalone query", () => {
    expect(ADMIN_RESOURCE_KEYS).not.toContain("tables");
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.tables)).toBe(false);
  });

  it("leaves people to their collection instead of a standalone query", () => {
    expect(ADMIN_RESOURCE_KEYS).not.toContain("people");
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.people)).toBe(false);
    expect(shouldRefetchAdminOnlyResourceQuery(queryKeys.admin.people)).toBe(false);
  });

  it("leaves exhibitors to their collection instead of a standalone query", () => {
    expect(ADMIN_RESOURCE_KEYS).not.toContain("exhibitors");
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.exhibitors)).toBe(false);
    expect(shouldRefetchAdminOnlyResourceQuery(queryKeys.admin.exhibitors)).toBe(false);
  });

  it("leaves the venue group to its collections instead of standalone queries", () => {
    for (const resource of ["venues", "rooms", "table-types", "layouts", "areas"]) {
      expect(ADMIN_RESOURCE_KEYS).not.toContain(resource);
      expect(shouldRefetchAdminResourceQuery(["admin", resource])).toBe(false);
      expect(shouldRefetchAdminOnlyResourceQuery(["admin", resource])).toBe(false);
    }
  });

  it("can limit refetches to registration resources for non-admin users", () => {
    expect(
      shouldRefetchAdminResourceQuery(queryKeys.admin.registrations, { includeAdminOnly: false }),
    ).toBe(true);

    for (const resource of ADMIN_ONLY_RESOURCE_KEYS) {
      expect(
        shouldRefetchAdminResourceQuery(["admin", resource], { includeAdminOnly: false }),
      ).toBe(false);
      expect(shouldRefetchAdminOnlyResourceQuery(["admin", resource])).toBe(true);
    }
  });

  it("does not refetch non-resource admin keys", () => {
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.personOptions("ali"))).toBe(false);
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.editionEvents("ed-01"))).toBe(false);
    expect(shouldRefetchAdminResourceQuery(queryKeys.admin.peopleRegistrations("person-1"))).toBe(
      false,
    );
  });

  it("does not refetch public keys", () => {
    expect(shouldRefetchAdminResourceQuery(queryKeys.activeEdition)).toBe(false);
    expect(shouldRefetchAdminResourceQuery(queryKeys.myRegistrations("token-1"))).toBe(false);
  });
});
