import { QueryClient } from "@tanstack/react-query";
import { createAdminCollection } from "./adminCollectionFactory";
import { describe, expect, it, vi } from "vitest";

describe("Query collection warm-start prerequisites", () => {
  it("renders cached rows before a failed refetch and mirrors direct writes", async () => {
    const client = new QueryClient();
    const key = ["admin", "tables"];
    client.setQueryData(key, [{ id: "one", label: "cached" }], { updatedAt: 1 });
    let reject!: (error: Error) => void;
    const collection = createAdminCollection<{ id: string; label: string }>({
      queryClient: client,
      queryKey: key,
      enabled: true,
      getKey: (row) => row.id,
      queryFn: () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    });
    const preload = collection.preload();
    await vi.waitFor(() => expect(collection.get("one")?.label).toBe("cached"));
    await preload;
    reject(new Error("offline"));
    await vi.waitFor(() => expect(collection.utils.lastError).toBeTruthy());
    expect(collection.get("one")?.label).toBe("cached");
    await collection.utils.writeUpsert({ id: "one", label: "patched" });
    expect(client.getQueryData(key)).toEqual([{ id: "one", label: "patched" }]);
    await collection.utils.writeDelete("one");
    expect(client.getQueryData(key)).toEqual([]);
    await collection.cleanup();
    client.clear();
  });
});
