import type { SliderItem } from "@/config/editions";

const FALLBACK_IMAGE = "/images/logo.svg";

/** Organization logo that quietly falls back to the festival logo when the image fails. */
export function LogoImage({ item, className }: { item: SliderItem; className: string }) {
  return (
    <img
      src={item.image}
      alt={item.name}
      loading="lazy"
      className={className}
      onError={(event) => {
        // Quietly fall back without console errors; clear the handler to avoid loops.
        event.currentTarget.onerror = null;
        event.currentTarget.src = FALLBACK_IMAGE;
      }}
    />
  );
}
