import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { m } from "@/paraglide/messages";

export function PublicOfflineNotice() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [updated, setUpdated] = useState<string>();
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const submit = (event: SubmitEvent) => {
      if (!navigator.onLine) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("submit", submit, true);
    };
  }, []);
  useEffect(() => {
    if (!offline || !("caches" in window)) return;
    void (async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith("public-site-"));
      const dates: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const date = (await cache.match(request))?.headers.get("x-public-cached-at");
          if (date) dates.push(date);
        }
      }
      // Use the oldest saved response rather than overstating freshness.
      setUpdated(dates.sort()[0]);
    })().catch(() => {});
  }, [offline]);
  if (!offline) return null;
  return (
    <Alert role="status" variant="warning">
      {m.public_offline_notice()}{" "}
      {updated && m.public_offline_updated({ time: new Date(updated).toLocaleString() })}
    </Alert>
  );
}
