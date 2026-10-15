import { m } from "@/paraglide/messages";
import { icons } from "lucide-react";
import { Icon } from "@/components/Icon";
import type { PublicSlide } from "./types";
import "./signage.css";

function Sticker({ name }: { name: string | null }) {
  const key = name
    ?.split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const icon = key ? icons[key as keyof typeof icons] : undefined;
  return icon ? <Icon icon={icon} className="size-full" /> : null;
}

/** Shared 1920×1080 canvas for the public player and editor previews. */
export function SlideRenderer({ slide }: { slide: PublicSlide }) {
  const { background, layers } = slide.template;
  return (
    /* oxlint-disable shadcn/no-inline-styles -- Validated template colors and canvas coordinates are data, shared with the editor preview. */
    <div
      className="site-signage-stage"
      style={{
        background:
          background.kind === "gradient"
            ? `linear-gradient(135deg, ${background.color}, ${background.end_color})`
            : background.color,
      }}
    >
      {background.kind === "image" && background.image && (
        <img className="site-signage-background" src={background.image} alt="" />
      )}
      {slide.kind === "image" && slide.image && (
        <img className="site-signage-background" src={slide.image} alt="" />
      )}
      {layers.map((layer) => {
        const binding = layer.binding;
        const image =
          layer.kind === "image"
            ? layer.image
            : binding === "logo"
              ? slide.organization?.logo
              : null;
        const text =
          layer.kind === "text"
            ? layer.text
            : binding === "name"
              ? slide.organization?.name
              : binding === "description"
                ? slide.organization?.description
                : binding === "sponsor"
                  ? slide.organization?.sponsor
                    ? m.admin_item_sponsor()
                    : ""
                  : binding === "title"
                    ? slide.title
                    : binding === "text"
                      ? slide.text
                      : null;
        return (
          <div
            key={layer.id}
            className="site-signage-layer"
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              width: `${layer.width}%`,
              height: `${layer.height}%`,
              transform: `rotate(${layer.rotation}deg)`,
              color: layer.color,
              fontSize: layer.font_size,
              background: layer.kind === "shape" ? layer.color : undefined,
              borderRadius: layer.kind === "shape" && layer.shape === "ellipse" ? "50%" : undefined,
            }}
          >
            {image ? (
              <img className="size-full object-contain" src={image} alt="" />
            ) : layer.kind === "icon" || binding === "icon" ? (
              <Sticker name={binding === "icon" ? slide.icon : layer.icon} />
            ) : (
              text
            )}
          </div>
        );
      })}
    </div>
    /* oxlint-enable shadcn/no-inline-styles */
  );
}
