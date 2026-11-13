import { CircleArrowDownIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import type { HeroRegistrationProps } from "@/components/heroRegistration";
interface CuveeHeroProps extends HeroRegistrationProps {
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
const CuveeHero = ({
  festivalName,
  title,
  subtitle,
  learnMoreLabel,
  scheduleLabel,
  facts = [],
  registration,
  note,
}: CuveeHeroProps) => {
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
        {facts.length > 0 && (
          <p className="cuvee-hero__meta">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        )}
        <div className="cuvee-hero__actions">
          {/* Entry is free and most events need no reservation, so discovering the festival
              leads and registering is the second action while it is open. */}
          <a href="#what-we-do" className="cuvee-button">
            {learnMoreLabel}
            <Icon icon={CircleArrowDownIcon} />
          </a>
          {registration ? (
            <button
              type="button"
              className="cuvee-button cuvee-button--ghost"
              onClick={registration.onRegister}
            >
              {registration.label}
            </button>
          ) : (
            <a href="#schedule" className="cuvee-button cuvee-button--ghost">
              {scheduleLabel}
            </a>
          )}
        </div>
        {note && <p className="cuvee-hero__note">{note}</p>}
      </div>
    </section>
  );
};

export default CuveeHero;
