import { CircleArrowDownIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import type { HeroRegistrationProps } from "@/components/heroRegistration";
interface RemuageHeroProps extends HeroRegistrationProps {
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
  facts = [],
  registration,
  note,
}: RemuageHeroProps) => {
  return (
    <section className="remuage-hero" id="welcome">
      <div className="remuage-hero__content">
        <span className="remuage-hero__eyebrow">{festivalName}</span>
        <h1 className="remuage-hero__title">{title}</h1>
        <p className="remuage-hero__subtitle">{subtitle}</p>
        {facts.length > 0 && (
          <p className="remuage-hero__meta">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        )}
        <div className="remuage-hero__actions">
          {registration ? (
            <button
              type="button"
              className="remuage-button remuage-button--primary"
              onClick={registration.onRegister}
            >
              {registration.label}
            </button>
          ) : (
            <a href="#what-we-do" className="remuage-button remuage-button--primary">
              {learnMoreLabel}
              <Icon icon={CircleArrowDownIcon} />
            </a>
          )}
          <a href="#schedule" className="remuage-button remuage-button--secondary">
            {scheduleLabel}
          </a>
        </div>
        {note && <p className="remuage-hero__note">{note}</p>}
      </div>

      <div className="remuage-hero__rack" aria-hidden="true">
        {RACK_CELLS.map((cell) => (
          <span key={cell} className={`remuage-hero__cell remuage-hero__cell--${cell + 1}`}>
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
