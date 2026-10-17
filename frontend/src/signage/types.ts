export interface Background {
  kind: "color" | "gradient" | "image";
  color: string;
  end_color: string;
  image: string | null;
}
export interface Layer {
  id: string;
  kind: "binding" | "text" | "image" | "icon" | "shape";
  binding: "logo" | "name" | "description" | "sponsor" | "title" | "text" | "icon" | null;
  text: string;
  image: string | null;
  icon: string | null;
  shape: "rectangle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  font_size: number;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  font?: "sans" | "serif" | "mono";
  align?: "left" | "center" | "right";
  fit?: "contain" | "cover";
}
export interface PublicSlide {
  id: string;
  kind: "organization" | "notice" | "image";
  duration: number;
  template: { background: Background; layers: Layer[] };
  translations?: Partial<
    Record<"text_nl" | "text_fr" | "text_en" | "title_nl" | "title_fr" | "title_en", string | null>
  > | null;
  text: string | null;
  title: string | null;
  image: string | null;
  icon: string | null;
  organization: { name: string; logo: string; description: string | null; sponsor: boolean } | null;
}
export interface Playlist {
  revision: string;
  epoch: string;
  slides: PublicSlide[];
}

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
