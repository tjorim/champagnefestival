import { m } from "@/paraglide/messages";
import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  className?: string;
}

/**
 * The festival wordmark: "CHAMPAGNE" with the red script "festival" tucked beneath it,
 * after the association's printed logo. Stacking keeps the full name visible in narrow
 * headers. Themes recolour it through `--wordmark-champagne` and `--wordmark-festival`
 * (see styles/tailwind.css); "festival" stays red in every theme.
 */
const BrandWordmark = ({ className }: BrandWordmarkProps) => (
  <span className={cn("site-wordmark", className)}>
    <span className="site-wordmark-champagne" aria-hidden="true">
      Champagne
    </span>
    <span className="site-wordmark-festival" aria-hidden="true">
      festival
    </span>
    <span className="sr-only">{m.festival_name()}</span>
  </span>
);

export default BrandWordmark;
