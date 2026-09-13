import { useQuery } from "@tanstack/react-query";

import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/utils/queryKeys";
import "./announcementBanner.css";

export interface PublicAnnouncement {
  id: string;
  text: string;
  level: "info" | "warning" | "urgent";
  link_url: string | null;
  link_label: string | null;
}

export async function fetchActiveAnnouncements(locale: string): Promise<PublicAnnouncement[]> {
  const response = await fetch(`/api/announcements/active?locale=${encodeURIComponent(locale)}`);
  if (!response.ok) throw new Error("Could not load announcements");
  return response.json() as Promise<PublicAnnouncement[]>;
}

function AnnouncementContent({
  item,
  focusable = true,
}: {
  item: PublicAnnouncement;
  focusable?: boolean;
}) {
  return (
    <>
      <span>{item.text}</span>{" "}
      {item.link_url && item.link_label && (
        <a href={item.link_url} tabIndex={focusable ? undefined : -1}>
          {item.link_label}
        </a>
      )}
    </>
  );
}

export default function AnnouncementBanner() {
  const locale = getLocale();
  const { data = [] } = useQuery({
    queryKey: queryKeys.announcements(locale),
    queryFn: () => fetchActiveAnnouncements(locale),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  if (!data.length) return null;

  const urgent = data.filter((item) => item.level === "urgent");
  const ticker = data.filter((item) => item.level !== "urgent");

  return (
    <>
      {urgent.length > 0 && (
        <section className="announcement-stack" aria-label={m.announcements_accessible_label()}>
          {urgent.map((item) => (
            <div
              key={item.id}
              className="announcement-banner announcement-urgent"
              role="alert"
              aria-live="assertive"
            >
              <AnnouncementContent item={item} />
            </div>
          ))}
        </section>
      )}
      {ticker.length > 0 && (
        // Pausing on hover/focus keeps the ticker readable without relying on
        // reduced-motion alone; tabIndex makes the container itself a focus
        // stop so keyboard users (not just mouse users) can pause it too.
        <div
          className="announcement-ticker"
          aria-label={m.announcements_accessible_label()}
          tabIndex={0}
        >
          <div className="announcement-ticker__track">
            {[0, 1].map((copy) =>
              ticker.map((item) => (
                <div
                  key={`${copy}-${item.id}`}
                  className={`announcement-ticker__item announcement-${item.level}`}
                  role={copy === 0 ? "status" : undefined}
                  aria-live={copy === 0 ? "off" : undefined}
                  aria-hidden={copy === 1}
                >
                  <AnnouncementContent item={item} focusable={copy === 0} />
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </>
  );
}
