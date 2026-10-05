import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveEnvelope } from "@/utils/liveStream";
import { queryKeys } from "@/utils/queryKeys";
import {
  patchAdminRegistrationLiveEvent,
  registerAdminRegistrationsCollection,
  resetAdminRegistrationsCollection,
  type AdminRegistrationsCollection,
} from "./adminRegistrationsCollection";

const fetchRegistration = vi.hoisted(() => vi.fn());

vi.mock("@/utils/adminFetch", () => ({
  fetchAllRegistrations: vi.fn(),
  fetchRegistration,
}));

const authHeaders = () => ({});
let nextEventTime = Date.parse("2026-10-05T10:00:00Z");

function makeEnvelope(overrides: Partial<LiveEnvelope> = {}): LiveEnvelope {
  nextEventTime += 1000;
  return {
    topic: "registration",
    action: "updated",
    scope: { edition_id: null, event_id: null, registration_id: "reg-1", table_id: null },
    keys: [[...queryKeys.admin.registrations]],
    ts: new Date(nextEventTime).toISOString(),
    id: "event-1",
    ...overrides,
  };
}

function makeCollection(
  writeUpsert: (data: unknown) => Promise<void> = () => Promise.resolve(),
  writeDelete: (key: unknown) => Promise<void> = () => Promise.resolve(),
) {
  const utils = { writeUpsert: vi.fn(writeUpsert), writeDelete: vi.fn(writeDelete) };
  return { collection: { utils } as unknown as AdminRegistrationsCollection, utils };
}

const cleanups: Array<() => void> = [];

function register(collection: AdminRegistrationsCollection) {
  cleanups.push(registerAdminRegistrationsCollection(collection));
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  fetchRegistration.mockReset();
});

describe("patchAdminRegistrationLiveEvent", () => {
  it("resolves only after every active collection has applied the upsert", async () => {
    fetchRegistration.mockResolvedValue({ id: "reg-1" });
    const resolvers: Array<() => void> = [];
    const pending = () => new Promise<void>((resolve) => resolvers.push(resolve));
    const first = makeCollection(pending);
    const second = makeCollection(pending);
    register(first.collection);
    register(second.collection);

    let settled = false;
    const patch = patchAdminRegistrationLiveEvent(makeEnvelope(), authHeaders).then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    expect(first.utils.writeUpsert).toHaveBeenCalledWith({ id: "reg-1" });
    expect(second.utils.writeUpsert).toHaveBeenCalledWith({ id: "reg-1" });
    expect(settled).toBe(false);

    resolvers[0]?.();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolvers[1]?.();
    await patch;
    expect(settled).toBe(true);
  });

  it("resolves only after every active collection has applied the delete", async () => {
    const resolvers: Array<() => void> = [];
    const pending = () => new Promise<void>((resolve) => resolvers.push(resolve));
    const first = makeCollection(undefined, pending);
    const second = makeCollection(undefined, pending);
    register(first.collection);
    register(second.collection);

    let settled = false;
    const patch = patchAdminRegistrationLiveEvent(
      makeEnvelope({ action: "deleted" }),
      authHeaders,
    ).then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    expect(first.utils.writeDelete).toHaveBeenCalledWith("reg-1");
    expect(second.utils.writeDelete).toHaveBeenCalledWith("reg-1");
    expect(fetchRegistration).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    resolvers.forEach((resolve) => resolve());
    await patch;
    expect(settled).toBe(true);
  });

  it("rejects when an upsert fails, after the other collections have settled", async () => {
    fetchRegistration.mockResolvedValue({ id: "reg-1" });
    const failure = new Error("upsert failed");
    let resolveHealthy: () => void = () => undefined;
    const failing = makeCollection(() => Promise.reject(failure));
    const healthy = makeCollection(
      () => new Promise<void>((resolve) => (resolveHealthy = resolve)),
    );
    register(failing.collection);
    register(healthy.collection);

    let outcome: unknown;
    const patch = patchAdminRegistrationLiveEvent(makeEnvelope(), authHeaders).catch((error) => {
      outcome = error;
    });

    await vi.waitFor(() => expect(healthy.utils.writeUpsert).toHaveBeenCalled());
    await Promise.resolve();
    expect(outcome).toBeUndefined();

    resolveHealthy();
    await patch;
    expect(outcome).toBe(failure);
  });

  it("rejects when a delete fails", async () => {
    const failure = new Error("delete failed");
    const failing = makeCollection(undefined, () => Promise.reject(failure));
    register(failing.collection);

    await expect(
      patchAdminRegistrationLiveEvent(makeEnvelope({ action: "deleted" }), authHeaders),
    ).rejects.toBe(failure);
  });

  it("rejects when a collection throws synchronously and still writes to the others", async () => {
    fetchRegistration.mockResolvedValue({ id: "reg-1" });
    const failure = new Error("sync not initialized");
    const throwing = makeCollection(() => {
      throw failure;
    });
    const healthy = makeCollection();
    register(throwing.collection);
    register(healthy.collection);

    await expect(patchAdminRegistrationLiveEvent(makeEnvelope(), authHeaders)).rejects.toBe(
      failure,
    );
    expect(healthy.utils.writeUpsert).toHaveBeenCalledWith({ id: "reg-1" });
  });
});

describe("resetAdminRegistrationsCollection", () => {
  it("resolves after the batched deletes are applied and rejects if the batch fails", async () => {
    const writeDelete = vi.fn(() => Promise.resolve());
    const writeBatch = vi.fn((callback: () => void) => {
      callback();
      return Promise.resolve();
    });
    const collection = {
      size: 2,
      keys: () => ["reg-1", "reg-2"],
      utils: { writeBatch, writeDelete },
    } as unknown as AdminRegistrationsCollection;

    await resetAdminRegistrationsCollection(collection);
    expect(writeDelete).toHaveBeenCalledTimes(2);

    const failure = new Error("batch failed");
    writeBatch.mockReturnValueOnce(Promise.reject(failure));
    await expect(resetAdminRegistrationsCollection(collection)).rejects.toBe(failure);
  });
});
