interface CuveeHeroProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
}

/**
 * Hero for the Cuvée visual theme: a champagne label on dark bottle glass,
 * crowned by a circular gold-foil seal.
 */
const CuveeHero = ({ festivalName, title, subtitle, learnMoreLabel, scheduleLabel }: CuveeHeroProps) => {
  return (
    <section className="cuvee-hero" id="welcome">
      <div className="cuvee-hero__label">
        <span className="cuvee-hero__seal" aria-hidden="true">
          CF
        </span>
        <span className="cuvee-eyebrow">{festivalName}</span>
        <h1 className="cuvee-hero__title">{title}</h1>
        <div className="cuvee-rule" aria-hidden="true">
          <span />
        </div>
        <p className="cuvee-hero__subtitle">{subtitle}</p>
        <div className="cuvee-hero__actions">
          <a href="#next-festival" className="btn cuvee-button">
            {learnMoreLabel}
            <i className="bi bi-arrow-down-circle ms-2" aria-hidden="true" />
          </a>
          <a href="#schedule" className="btn cuvee-button cuvee-button--ghost">
            {scheduleLabel}
          </a>
        </div>
      </div>
    </section>
  );
};

export default CuveeHero;
