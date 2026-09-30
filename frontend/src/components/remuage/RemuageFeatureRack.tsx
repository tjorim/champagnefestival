import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
export interface RemuageFeatureItem {
  id: number | string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface RemuageFeatureRackProps {
  items: readonly RemuageFeatureItem[];
}

const RemuageFeatureRack = ({ items }: RemuageFeatureRackProps) => {
  return (
    <div className="remuage-feature-rack">
      {items.map((feature) => (
        <article key={feature.id} className="remuage-feature">
          <span className="remuage-feature__aperture" aria-hidden="true">
            <Icon icon={feature.icon} />
          </span>
          <div className="remuage-feature__content">
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

export default RemuageFeatureRack;
