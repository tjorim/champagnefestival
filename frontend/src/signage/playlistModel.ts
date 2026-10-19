import type { TemplateKind } from "./editorModel";
export interface ChannelDraft {
  name: string;
  slug: string;
  edition_id: string;
  active: boolean;
}
export interface Channel extends ChannelDraft {
  id: string;
  epoch: string;
  revision: number;
}
export interface SlideContent {
  title: string | null;
  text: string | null;
  icon: string | null;
  image: string | null;
  organization_type?: "producer" | "vendor" | "sponsor" | null;
}
export interface SlideDraft {
  channel_id: string;
  template_id: string;
  kind: TemplateKind;
  duration: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  content: SlideContent;
}
export interface Slide extends SlideDraft {
  id: string;
}
export function emptySlide(channel_id: string, sort_order: number): SlideDraft {
  return {
    channel_id,
    sort_order,
    template_id: "",
    kind: "organizations",
    duration: 10,
    active: true,
    starts_at: null,
    ends_at: null,
    content: {
      title: null,
      text: null,
      icon: null,
      image: null,
      organization_type: "producer",
    },
  };
}
export function validSlide(slide: SlideDraft): boolean {
  const { content } = slide;
  return (
    Boolean(slide.template_id) &&
    Number.isInteger(slide.duration) &&
    slide.duration >= 1 &&
    slide.duration <= 3600 &&
    (!slide.starts_at || Number.isFinite(Date.parse(slide.starts_at))) &&
    (!slide.ends_at || Number.isFinite(Date.parse(slide.ends_at))) &&
    (!slide.starts_at ||
      !slide.ends_at ||
      Date.parse(slide.ends_at) > Date.parse(slide.starts_at)) &&
    (slide.kind !== "notice" || Boolean(content.text?.trim())) &&
    (slide.kind !== "image" || Boolean(content.image))
  );
}
export function moveSlide<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const result = [...items];
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}
/** Datetime inputs display local wall time; API timestamps always include a timezone. */
export function localSchedule(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
