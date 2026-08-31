import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { removeAuthenticatedQueries } from "./queryInvalidation";

describe("removeAuthenticatedQueries", () => {
  it("clears venue plans on logout so a subsequent unauthorized user cannot read them", () => {
    const queryClient = new QueryClient();
    const venuePlanKey = ["venue-plan", "2026"] as const;
    queryClient.setQueryData(venuePlanKey, { layouts: [{ id: "private-layout" }] });
    queryClient.setQueryData(["admin", "registrations"], [{ id: "private-registration" }]);
    queryClient.setQueryData(["faq", "en"], [{ id: "public-content" }]);

    removeAuthenticatedQueries(queryClient);

    expect(queryClient.getQueryData(venuePlanKey)).toBeUndefined();
    expect(queryClient.getQueryData(["admin", "registrations"])).toBeUndefined();
    expect(queryClient.getQueryData(["faq", "en"])).toEqual([{ id: "public-content" }]);
  });
});
