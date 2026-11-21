import type {
  Background as ApiBackground,
  Layer as ApiLayer,
  PublicSlide as ApiPublicSlide,
  Playlist as ApiPlaylist,
} from "@/api-types";
/** The editor fills the schema defaults before rendering. */
export type Background = Required<ApiBackground>;
export type Layer = Required<
  Omit<ApiLayer, "name" | "visible" | "locked" | "font" | "align" | "fit">
> &
  Pick<ApiLayer, "name" | "visible" | "locked" | "font" | "align" | "fit">;
export type PublicSlide = Omit<ApiPublicSlide, "template"> & {
  template: { background: Background; layers: Layer[] };
};
export type Playlist = Omit<ApiPlaylist, "slides"> & { slides: PublicSlide[] };

export function playlistImages(playlist: Playlist): string[] {
  return [
    ...new Set(
      playlist.slides
        .flatMap((slide) => [
          slide.image,
          slide.organization?.logo,
          slide.template.background.image,
          ...slide.template.layers.map((layer) => layer.image),
        ])
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}
