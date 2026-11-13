import type { ReactNode } from "react";
import { ArrowRightIcon, CalendarPlusIcon, CircleArrowDownIcon } from "lucide-react";
import FestivalMascot from "@/components/FestivalMascot";
import { Icon } from "@/components/Icon";
import type { HeroRegistrationProps } from "@/components/heroRegistration";
import { m } from "@/paraglide/messages";

interface BilletHeroProps extends HeroRegistrationProps {
  festivalName: string;
  title: string;
  subtitle: string;
  learnMoreLabel: string;
  scheduleLabel: string;
  /** Already-formatted festival dates; left out while there is no edition. */
  dateRange: string;
  /** Printed as the ticket's serial. */
  year: string | null;
  venueName: string;
  venueLines: string[];
  mapsUrl: string | null;
  /** The live countdown, or null when no festival is scheduled. */
  countdown: ReactNode;
}

/**
 * Billet's page top: the festival as a portrait ticket, stamped "free entry". Artwork at the head,
 * the title below it, and a tear-off stub with when, where, the countdown, the way in
 * and a barcode. From wide screens it stays in view beside the scrolling sections
 * (see theme-billet.css), so it replaces the hero, the at-a-glance strip and the
 * countdown in Next Festival for this theme.
 */
const BilletHero = ({
  festivalName,
  title,
  subtitle,
  learnMoreLabel,
  scheduleLabel,
  dateRange,
  year,
  venueName,
  venueLines,
  mapsUrl,
  countdown,
  registration,
  note,
}: BilletHeroProps) => {
  return (
    <section className="billet-hero" id="welcome">
      <div className="billet-ticket">
        <div className="billet-ticket__art">
          <FestivalMascot
            crop="half"
            className="billet-ticket__mascot"
            sizes="10rem"
            loading="eager"
          />
          {/* The ticket is a picture, not a requirement: entry is free and only some
              events take reservations, so the stamp says so. */}
          <p className="billet-stamp">{m.festival_free_entry()}</p>
        </div>

        <div className="billet-ticket__main">
          <span className="billet-label">{festivalName}</span>
          <h1 className="billet-title">{title}</h1>
          <p className="billet-subtitle">{subtitle}</p>
        </div>

        <div className="billet-ticket__stub">
          <dl className="billet-facts">
            {dateRange && (
              <div>
                <dt className="billet-label">{m.festival_facts_when()}</dt>
                <dd className="billet-fact">{dateRange}</dd>
              </div>
            )}
            {venueName && (
              <div>
                <dt className="billet-label">{m.festival_facts_where()}</dt>
                <dd className="billet-fact">
                  <a href="#map">{venueName}</a>
                </dd>
                {venueLines.length > 0 && (
                  <dd className="billet-address">{venueLines.join(", ")}</dd>
                )}
                {mapsUrl && (
                  <dd className="billet-address">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="billet-link"
                    >
                      {m.location_open_in_maps()}
                      <Icon icon={ArrowRightIcon} />
                    </a>
                  </dd>
                )}
              </div>
            )}
          </dl>

          {countdown && (
            <div className="billet-countdown">
              <span className="billet-label">{m.next_festival_title()}</span>
              {countdown}
            </div>
          )}

          <div className="billet-actions">
            {registration ? (
              <button type="button" className="billet-button" onClick={registration.onRegister}>
                <Icon icon={CalendarPlusIcon} />
                {registration.label}
              </button>
            ) : (
              <a href="#what-we-do" className="billet-button">
                {learnMoreLabel}
                <Icon icon={CircleArrowDownIcon} />
              </a>
            )}
            <a href="#schedule" className="billet-link">
              {scheduleLabel}
            </a>
          </div>
          {note && <p className="billet-note">{note}</p>}

          <div className="billet-barcode" aria-hidden="true">
            <span className="billet-barcode__bars" />
            {year && <span className="billet-barcode__serial">N° {year}</span>}
          </div>
        </div>
      </div>
    </section>
  );
};

export default BilletHero;
