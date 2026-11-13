import type { ReactNode } from "react";
import { ArrowRightIcon, CalendarPlusIcon, CircleArrowDownIcon } from "lucide-react";
import FestivalMascot from "@/components/FestivalMascot";
import { Icon } from "@/components/Icon";
import type { HeroRegistrationProps } from "@/components/heroRegistration";
import { m } from "@/paraglide/messages";

interface AfficheHeroProps extends HeroRegistrationProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
  /** Already-formatted festival dates; the tile is left out while there is no edition. */
  dateRange: string;
  venueName: string;
  venueLines: string[];
  mapsUrl: string | null;
  /** Names for the running band; the full producer list stays further down the page. */
  producerNames: string[];
  /** The live countdown, or null when no festival is scheduled. */
  countdown: ReactNode;
}

/**
 * Affiche's page top: a poster-like grid of tiles that answers what, when, where and
 * how long until on the first screen, instead of a title followed by stacked sections.
 * It replaces both the hero and the at-a-glance strip for this theme.
 */
const AfficheHero = ({
  festivalName,
  title,
  subtitle,
  learnMoreLabel,
  scheduleLabel,
  dateRange,
  venueName,
  venueLines,
  mapsUrl,
  producerNames,
  countdown,
  registration,
  note,
}: AfficheHeroProps) => {
  return (
    <section className="affiche-bento" id="welcome">
      <div className="affiche-tile affiche-tile--hero">
        <span className="affiche-kicker">{festivalName}</span>
        <h1 className="affiche-title">{title}</h1>
        <p className="affiche-subtitle">{subtitle}</p>
        <div className="affiche-actions">
          {registration ? (
            <button type="button" className="affiche-button" onClick={registration.onRegister}>
              <Icon icon={CalendarPlusIcon} />
              {registration.label}
            </button>
          ) : (
            <a href="#what-we-do" className="affiche-button">
              {learnMoreLabel}
              <Icon icon={CircleArrowDownIcon} />
            </a>
          )}
          <a href="#schedule" className="affiche-link">
            {scheduleLabel}
          </a>
        </div>
        {note && <p className="affiche-note">{note}</p>}
      </div>

      <div className="affiche-tile affiche-tile--mascot">
        <FestivalMascot
          className="affiche-mascot"
          sizes="(min-width: 992px) 18rem, 40vw"
          loading="eager"
        />
        {/* Entry to the festival is free; only some events take reservations. */}
        <p className="affiche-sticker">{m.festival_free_entry()}</p>
      </div>

      {dateRange && (
        <div className="affiche-tile affiche-tile--when">
          <span className="affiche-kicker">{m.festival_facts_when()}</span>
          <p className="affiche-fact">{dateRange}</p>
        </div>
      )}

      {countdown && (
        <div className="affiche-tile affiche-tile--countdown">
          <span className="affiche-kicker">{m.next_festival_title()}</span>
          {countdown}
        </div>
      )}

      {venueName && (
        <div className="affiche-tile affiche-tile--where">
          <span className="affiche-kicker">{m.festival_facts_where()}</span>
          <p className="affiche-fact">
            <a href="#map">{venueName}</a>
          </p>
          {venueLines.length > 0 && <p className="affiche-address">{venueLines.join(", ")}</p>}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="affiche-link">
              {m.location_open_in_maps()}
              <Icon icon={ArrowRightIcon} />
            </a>
          )}
        </div>
      )}

      {producerNames.length > 0 && (
        // Decorative: the producers section below lists the same names with their details.
        <div className="affiche-marquee" aria-hidden="true">
          <div className="affiche-marquee__track">
            {[0, 1].map((copy) => (
              <span key={copy} className="affiche-marquee__group">
                {producerNames.map((name) => (
                  <span key={name} className="affiche-marquee__item">
                    {name}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default AfficheHero;
