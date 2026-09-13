import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

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

export default function AnnouncementBanner() {
  const locale = getLocale();
  const { data = [] } = useQuery({
    queryKey: queryKeys.announcements(locale),
    queryFn: () => fetchActiveAnnouncements(locale),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<PublicAnnouncement | null>(null);
  const titleId = useId();
  if (!data.length) return null;

  return (
    <>
      <div
        className="announcement-ticker"
        role="region"
        aria-label={m.announcements_accessible_label()}
      >
        <div className="announcement-ticker__track">
          {[0, 1].map((copy) =>
            data.map((item) => (
              <div
                key={`${copy}-${item.id}`}
                className={`announcement-ticker__item announcement-${item.level}`}
                // The visible copy carries live-region semantics so urgent items
                // still interrupt screen readers even though they now scroll like
                // everything else; the duplicate exists only for the seamless
                // scroll loop and must stay out of the accessibility tree.
                role={copy === 0 ? (item.level === "urgent" ? "alert" : "status") : undefined}
                aria-live={copy === 0 ? (item.level === "urgent" ? "assertive" : "off") : undefined}
                aria-hidden={copy === 1}
              >
                {copy === 0 ? (
                  <button
                    type="button"
                    className="announcement-ticker__item-content"
                    onClick={() => setSelected(item)}
                  >
                    {item.text}
                  </button>
                ) : (
                  <span className="announcement-ticker__item-content">{item.text}</span>
                )}
              </div>
            )),
          )}
        </div>
      </div>
      <Modal
        show={selected != null}
        onHide={() => setSelected(null)}
        aria-labelledby={titleId}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title id={titleId}>{m.announcement_dialog_title()}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>{selected?.text}</p>
          {selected?.link_url && selected.link_label && (
            <Button href={selected.link_url} variant="primary">
              {selected.link_label}
            </Button>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
