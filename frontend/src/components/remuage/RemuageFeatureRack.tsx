export interface RemuageFeatureItem {
  id: number | string;
  title: string;
  description: string;
  iconClass: string;
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
            <i className={feature.iconClass} />
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
