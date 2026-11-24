import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUpIcon, ChevronDownIcon, GripVerticalIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@/components/ui/button";
import { AdminField, AdminLabel } from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";
import { type Slide } from "../playlistModel";
import type { Playlist } from "../types";
import { SlideRenderer } from "../SlideRenderer";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <AdminField>
      <AdminLabel>{label}</AdminLabel>
      {children}
    </AdminField>
  );
}
export function Row({
  slide,
  index,
  count,
  busy,
  label,
  edit,
  move,
}: {
  slide: Slide;
  index: number;
  count: number;
  busy: boolean;
  label: string;
  edit: () => void;
  move: (from: number, to: number) => void;
}) {
  const { ref, handleRef } = useSortable({ id: slide.id, index, disabled: busy });
  return (
    <li ref={ref} className="flex flex-wrap items-center gap-2 rounded border p-2">
      <Button
        className="hover:bg-primary"
        ref={handleRef}
        disabled={busy}
        aria-label={m.signage_channels_drag({ name: label })}
      >
        <Icon icon={GripVerticalIcon} />
      </Button>
      <Button variant="ghost" disabled={busy} onClick={edit}>
        {label}
      </Button>
      <span>
        {m.signage_channels_duration_status({
          seconds: slide.duration,
          status: slide.active ? m.signage_channels_active() : m.signage_channels_inactive(),
        })}
      </span>
      <Button
        className="hover:bg-primary"
        disabled={busy || index === 0}
        aria-label={m.signage_channels_up({ name: label })}
        onClick={() => move(index, index - 1)}
      >
        <Icon icon={ChevronUpIcon} />
      </Button>
      <Button
        className="hover:bg-primary"
        disabled={busy || index === count - 1}
        aria-label={m.signage_channels_down({ name: label })}
        onClick={() => move(index, index + 1)}
      >
        <Icon icon={ChevronDownIcon} />
      </Button>
    </li>
  );
}
export function Preview({ playlist }: { playlist: Playlist }) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(0.3);
  const viewport = useRef<HTMLDivElement>(null);
  const slide = playlist.slides[index % playlist.slides.length];
  useEffect(() => {
    if (!slide) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % playlist.slides.length),
      slide.duration * 1000,
    );
    return () => clearTimeout(timer);
  }, [slide, playlist]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setScale((entry?.contentRect.width ?? 576) / 1920),
    );
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <p role="status">
        {m.signage_channels_total({
          seconds: playlist.slides.reduce((sum, item) => sum + item.duration, 0),
          count: playlist.slides.length,
        })}
      </p>
      {!slide && <AdminEmptyState>{m.signage_channels_empty()}</AdminEmptyState>}
      <div ref={viewport} className="site-signage-editor-viewport">
        {/* oxlint-disable-next-line shadcn/no-inline-styles -- Scale the shared 1920x1080 canvas to the measured preview width. */}
        <div className="site-signage-editor-canvas" style={{ transform: `scale(${scale})` }}>
          {slide && <SlideRenderer slide={slide} />}
        </div>
      </div>
    </>
  );
}
