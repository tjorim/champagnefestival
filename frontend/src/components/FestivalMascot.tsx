import { cn } from "@/lib/utils";

const VARIANTS = {
  // The whole painting: the hostess beside her standing table.
  full: { name: "mascot", width: 360, height: 845 },
  // Head to clutch, fading out below the table top: for stacked layouts where height is scarce.
  half: { name: "mascot-half", width: 360, height: 534 },
} as const;

interface FestivalMascotProps {
  crop?: keyof typeof VARIANTS;
  className?: string;
}

/**
 * The festival's painted hostess at her standing table, cut out on a transparent
 * background so she sits on any theme. Purely decorative: the surrounding section
 * carries the content, so assistive technology skips her. Lazy loading means a
 * crop hidden by the current layout is never downloaded.
 */
const FestivalMascot = ({ crop = "full", className }: FestivalMascotProps) => {
  const { name, width, height } = VARIANTS[crop];
  return (
    <img
      src={`/images/${name}-360.webp`}
      srcSet={`/images/${name}-360.webp 360w, /images/${name}-720.webp 720w`}
      sizes="(min-width: 768px) 9rem, 8rem"
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      data-slot="festival-mascot"
      className={cn("pointer-events-none h-auto select-none", className)}
    />
  );
};

export default FestivalMascot;
