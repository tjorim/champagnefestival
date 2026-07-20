interface RemuageHeroProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
}

const RACK_CELLS = Array.from({ length: 9 }, (_, index) => index);

const RemuageHero = ({
  festivalName,
  title,
  subtitle,
  learnMoreLabel,
  scheduleLabel,
}: RemuageHeroProps) => {
  return (
    <section className="remuage-hero" id="welcome">
      <div className="remuage-hero__content">
        <span className="remuage-hero__eyebrow">{festivalName}</span>
        <h1 className="remuage-hero__title">{title}</h1>
        <p className="remuage-hero__subtitle">{subtitle}</p>
        <div className="remuage-hero__actions">
          <a href="#next-festival" className="btn remuage-button remuage-button--primary">
            {learnMoreLabel}
            <i className="bi bi-arrow-down-circle ms-2" aria-hidden="true" />
          </a>
          <a href="#schedule" className="btn remuage-button remuage-button--secondary">
            {scheduleLabel}
          </a>
        </div>
      </div>

      <div className="remuage-hero__rack" aria-hidden="true">
        {RACK_CELLS.map((cell) => (
          <span
            key={cell}
            className={`remuage-hero__cell remuage-hero__cell--${cell + 1}`}
          >
            <span className="remuage-hero__disc">
              <span className="remuage-hero__mark" />
            </span>
          </span>
        ))}
      </div>
    </section>
  );
};

export default RemuageHero;
