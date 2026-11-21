import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
export interface RivieraFeatureItem {
  id: number | string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface RivieraFeatureGridProps {
  items: RivieraFeatureItem[];
}

const RivieraFeatureGrid = ({ items }: RivieraFeatureGridProps) => {
  return (
    <div className="riviera-feature-grid">
      {items.map((feature, index) => (
        <article key={feature.id} className="riviera-feature-card">
          <div className="riviera-feature-card__number">{String(index + 1).padStart(2, "0")}</div>
          <span className="riviera-feature-card__icon" aria-hidden="true">
            <Icon icon={feature.icon} />
          </span>
          <div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default RivieraFeatureGrid;
