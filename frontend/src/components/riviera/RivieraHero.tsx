import { CircleArrowDownIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import type { HeroRegistrationProps } from "@/components/heroRegistration";
interface RivieraHeroProps extends HeroRegistrationProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
}

const RivieraHero = ({
  festivalName,
  title,
  subtitle,
  learnMoreLabel,
  scheduleLabel,
  facts = [],
  registration,
  note,
}: RivieraHeroProps) => {
  return (
    <section className="riviera-hero" id="welcome">
      {/* Content first: it takes the wide left grid column; the poster sits right.
          On mobile the poster is hoisted back above the text via order: -1. */}
      <div className="riviera-hero__content">
        <span className="riviera-eyebrow">{festivalName}</span>
        <h1 className="riviera-hero__title">{title}</h1>
        <p className="riviera-hero__subtitle">{subtitle}</p>
        {facts.length > 0 && (
          <p className="riviera-hero__meta">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        )}
        <div className="riviera-hero__actions">
          {registration ? (
            <button type="button" className="riviera-button" onClick={registration.onRegister}>
              {registration.label}
            </button>
          ) : (
            <a href="#what-we-do" className="riviera-button">
              {learnMoreLabel}
              <Icon icon={CircleArrowDownIcon} />
            </a>
          )}
          <a href="#schedule" className="riviera-button riviera-button--secondary">
            {scheduleLabel}
          </a>
        </div>
        {note && <p className="riviera-hero__note">{note}</p>}
      </div>
      <div className="riviera-hero__poster" aria-hidden="true">
        <span className="riviera-hero__poster-mark">CF</span>
      </div>
    </section>
  );
};

export default RivieraHero;
