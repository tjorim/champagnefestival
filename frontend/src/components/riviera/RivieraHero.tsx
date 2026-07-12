interface RivieraHeroProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
}

const RivieraHero = ({ festivalName, title, subtitle, learnMoreLabel, scheduleLabel }: RivieraHeroProps) => {
  return (
    <section className="riviera-hero" id="welcome">
      <div className="riviera-hero__poster" aria-hidden="true">
        <span className="riviera-hero__poster-mark">CF</span>
      </div>
      <div className="riviera-hero__content">
        <span className="riviera-eyebrow">{festivalName}</span>
        <h1 className="riviera-hero__title">{title}</h1>
        <p className="riviera-hero__subtitle">{subtitle}</p>
        <div className="riviera-hero__actions">
          <a href="#next-festival" className="btn riviera-button riviera-button--primary">
            {learnMoreLabel}
            <i className="bi bi-arrow-down-circle ms-2" aria-hidden="true" />
          </a>
          <a href="#schedule" className="btn riviera-button riviera-button--secondary">
            {scheduleLabel}
          </a>
        </div>
      </div>
    </section>
  );
};

export default RivieraHero;
