import { useQuery } from "@tanstack/react-query";

import { getLocale } from "@/paraglide/runtime";
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

export default function AnnouncementBanner() {
  const locale = getLocale();
  const { data = [] } = useQuery({
    queryKey: queryKeys.announcements(locale),
    queryFn: () => fetchActiveAnnouncements(locale),
    staleTime: 60_000,
  });
  if (!data.length) return null;

  return (
    <section className="announcement-stack" aria-label="Announcements">
      {data.map((item) => (
        <div
          key={item.id}
          className={`announcement-banner announcement-${item.level}`}
          role={item.level === "urgent" ? "alert" : "status"}
          aria-live={item.level === "urgent" ? "assertive" : "off"}
        >
          <span>{item.text}</span>{" "}
          {item.link_url && item.link_label && <a href={item.link_url}>{item.link_label}</a>}
        </div>
      ))}
    </section>
  );
}
