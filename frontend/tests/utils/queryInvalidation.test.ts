import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateAdmin } from "@/utils/queryInvalidation";

describe("invalidateAdmin", () => {
  it("invalidates each provided query key", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAdmin(queryClient, [
      ["admin", "people"],
      ["admin", "members"],
    ]);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ["admin", "people"] });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ["admin", "members"] });
  });
});
