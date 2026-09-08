/// <reference lib="webworker" />
// Adds push and notificationclick listeners to the shared production worker.
// Installation, activation and fetch handling remain in sw.ts.

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title: string;
  body: string;
}

function isPushPayload(value: unknown): value is PushPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PushPayload).title === "string" &&
    typeof (value as PushPayload).body === "string"
  );
}

export function registerPushHandlers(): void {
  self.addEventListener("push", (event: PushEvent) => {
    let payload: PushPayload = { title: "Champagnefestival", body: "" };
    try {
      const data: unknown = event.data?.json();
      if (isPushPayload(data)) payload = data;
    } catch {
      // Not JSON — fall back to the default payload above rather than failing silently.
    }

    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192x192.png",
      }),
    );
  });

  // Always navigates to a fixed path, never a URL read from the push
  // payload — the payload is server-controlled today (only an admin
  // test-send exists, #942's future composer doesn't ship here), but
  // keeping this fixed by construction means no future sender can turn a
  // notification click into an open redirect, per the issue's "prevent
  // arbitrary target URLs" requirement.
  self.addEventListener("notificationclick", (event: NotificationEvent) => {
    event.notification.close();
    event.waitUntil(self.clients.openWindow("/"));
  });
}
