import { afterEach, expect, it, vi } from "vitest";
import { submitRegistration, submitWaitlistEntry } from "./publicRegistrationApi";
import { m } from "@/paraglide/messages";

afterEach(() => vi.unstubAllGlobals());
it("refuses offline registration and waitlist writes before fetch", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  await expect(submitRegistration({} as Parameters<typeof submitRegistration>[0])).rejects.toThrow(
    m.public_offline_write(),
  );
  await expect(
    submitWaitlistEntry({} as Parameters<typeof submitWaitlistEntry>[0], "id"),
  ).rejects.toThrow(m.public_offline_write());
  expect(network).not.toHaveBeenCalled();
});
