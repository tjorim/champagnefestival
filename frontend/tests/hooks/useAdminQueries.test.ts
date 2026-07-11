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
