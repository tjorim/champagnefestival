import { m } from "@/paraglide/messages";
import { signageIcons } from "./icons";
import { Icon } from "@/components/Icon";
import type { PublicSlide } from "./types";
import "./signage.css";

function Sticker({ name }: { name: string | null }) {
  const icon = name && Object.hasOwn(signageIcons, name) ? signageIcons[name] : undefined;
  return icon ? <Icon icon={icon} className="size-full" /> : null;
}

/** Shared 1920×1080 canvas for the public player and editor previews. */
export function SlideRenderer({ slide }: { slide: PublicSlide }) {
  const { background, layers } = slide.template;
  function noticeText(field: "title" | "text") {
    const filled = (["nl", "fr", "en"] as const)
      .map((lang) => slide.translations?.[`${field}_${lang}`])
      .filter(Boolean);
    return filled.length ? filled.join("\n") : slide[field];
  }
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
      {layers
        .filter((layer) => layer.visible !== false)
        .map((layer) => {
          const binding = layer.kind === "binding" ? layer.binding : null;
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
                      ? noticeText("title")
                      : binding === "text"
                        ? noticeText("text")
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
                fontFamily: {
                  sans: "Arial, sans-serif",
                  serif: "Georgia, serif",
                  mono: "monospace",
                }[layer.font ?? "sans"],
                textAlign: layer.align ?? "center",
                justifyContent: { left: "flex-start", center: "center", right: "flex-end" }[
                  layer.align ?? "center"
                ],
                background: layer.kind === "shape" ? layer.color : undefined,
                borderRadius:
                  layer.kind === "shape" && layer.shape === "ellipse" ? "50%" : undefined,
              }}
            >
              {image ? (
                <img
                  className="size-full"
                  style={{ objectFit: layer.fit ?? "contain" }}
                  src={image}
                  alt=""
                />
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
