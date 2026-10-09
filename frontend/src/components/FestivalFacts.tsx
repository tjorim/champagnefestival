import { CalendarDaysIcon, CalendarPlusIcon, MapPinIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Button, ButtonLink } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

interface FestivalFactsProps {
  dateRange: string;
  venueName: string;
  city: string;
  canRegister: boolean;
  /** Already-formatted date on which registrations open, when they are not open yet. */
  registrationOpensOn: string | null;
  onRegister: () => void;
}

/**
 * At-a-glance strip below the hero: when and where the festival takes place,
 * plus the primary registration action. Uses semantic colours only, so every
 * runtime theme picks it up without extra stylesheet work.
 */
const FestivalFacts = ({
  dateRange,
  venueName,
  city,
  canRegister,
  registrationOpensOn,
  onRegister,
}: FestivalFactsProps) => {
  const venue = [venueName, city].filter(Boolean).join(", ");

  return (
    // A div region rather than <section>: themes style `main > section` as content cards.
    <div
      role="region"
      data-slot="festival-facts"
      className="relative z-10 col-span-full border-y border-border bg-card text-card-foreground"
      aria-label={m.festival_facts_label()}
    >
      <div className="site-container mx-auto flex w-full flex-wrap items-center justify-between gap-x-10 gap-y-5 py-5">
        <dl className="m-0 flex flex-wrap gap-x-10 gap-y-4">
          {dateRange && (
            <div className="flex items-center gap-3">
              <Icon icon={CalendarDaysIcon} className="text-2xl text-primary" />
              <div>
                <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  {m.festival_facts_when()}
                </dt>
                <dd className="m-0 text-lg font-semibold">{dateRange}</dd>
              </div>
            </div>
          )}
          {venue && (
            <div className="flex items-center gap-3">
              <Icon icon={MapPinIcon} className="text-2xl text-primary" />
              <div>
                <dt className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  {m.festival_facts_where()}
                </dt>
                <dd className="m-0 text-lg font-semibold">
                  <a href="#map" className="text-inherit underline-offset-4 hover:underline">
                    {venue}
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>
        {canRegister ? (
          <Button variant="brand" size="lg" className="h-auto px-5 py-3" onClick={onRegister}>
            <Icon icon={CalendarPlusIcon} />
            {m.registration_cta()}
          </Button>
        ) : registrationOpensOn ? (
          <p className="m-0 text-muted-foreground">
            {m.registration_opens_on({ date: registrationOpensOn })}
          </p>
        ) : (
          <ButtonLink href="#schedule" variant="outline" size="lg" className="h-auto px-5 py-3">
            {m.schedule_title()}
          </ButtonLink>
        )}
      </div>
    </div>
  );
};

export default FestivalFacts;
