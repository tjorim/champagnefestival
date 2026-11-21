import type { ChannelOut, SlideOut } from "@/api-types";
export type ChannelDraft = Required<import("@/api-types").ChannelWrite>;
export type Channel = ChannelOut;
/** Form controls materialize the API defaults. */
export type SlideContent = Required<
  Pick<import("@/api-types").Content, "title" | "text" | "icon" | "image">
> &
  Pick<import("@/api-types").Content, "organization_type">;
export type SlideDraft = Omit<Required<import("@/api-types").SlideWrite>, "content"> & {
  content: SlideContent;
};
export type Slide = Omit<SlideOut, "content"> & Pick<SlideDraft, "content">;
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
