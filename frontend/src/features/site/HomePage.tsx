import { PublicOfflineNotice } from "@/features/site/PublicOfflineNotice";
import { useNow } from "@/hooks/useNow";
import {
  CalendarPlusIcon,
  CircleArrowDownIcon,
  DoorOpenIcon,
  ExternalLinkIcon,
  SparklesIcon,
  ShoppingBagIcon,
  WineIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AppSuspense } from "@/components/AppSuspense";
import { Button, ButtonLink } from "@/components/ui/button";
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import Footer from "@/app/layout/Footer";
import Header from "@/app/layout/Header";
import HeaderClassic from "@/app/layout/HeaderClassic";
import ThemeSwitcher from "@/app/theme/ThemeSwitcher";
import RivieraFeatureGrid from "@/features/site/riviera/RivieraFeatureGrid";
import RivieraHero from "@/features/site/riviera/RivieraHero";
import CuveeHero from "@/features/site/cuvee/CuveeHero";
import AfficheHero from "@/features/site/affiche/AfficheHero";
import BilletHero from "@/features/site/billet/BilletHero";
import BilletProgramme from "@/features/site/billet/BilletProgramme";
import type { HeroRegistrationProps } from "@/features/site/heroRegistration";
import RemuageFeatureRack from "@/features/site/remuage/RemuageFeatureRack";
import RemuageHero from "@/features/site/remuage/RemuageHero";
import EventStructuredData from "@/features/site/JsonLd";
import FestivalFacts from "@/features/site/FestivalFacts";
import FestivalMascot from "@/features/site/FestivalMascot";
import ContactInfo from "@/features/site/ContactInfo";
import SectionHeading from "@/features/site/SectionHeading";
import SuspenseWithBoundary from "@/components/SuspenseWithBoundary";
import LoadWhenVisible from "@/features/site/LoadWhenVisible";
import LazyRegistrationModal from "@/features/registration/LazyRegistrationModal";
import AnnouncementBanner from "@/features/site/AnnouncementBanner";
import MaintenancePage from "@/features/maintenance/MaintenancePage";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useVisualTheme } from "@/app/theme/useVisualTheme";
import { getFestivalDateRange, useActiveEdition } from "@/hooks/useActiveEdition";
import { useEditionHeroImage } from "@/features/site/useEditionHeroImage";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { featureItems } from "@/config/features";
import { dayjs, endOfDay, formatDate, formatDateRange } from "@/lib/format/dateUtils";
import { generateGoogleMapsUrl } from "@/lib/venue/maps";
import { editionStandsQueryOptions, type OrganizationStands } from "@/lib/api/standsApi";
import type { SliderItem } from "@/config/editions";

const FEATURE_ICON_BY_ID: Record<number, LucideIcon> = {
  1: DoorOpenIcon,
  2: WineIcon,
  3: ShoppingBagIcon,
};

// Components - Lazy loaded
const BubbleBackground = lazy(() => import("@/features/site/BubbleBackground"));
// Important visible components with deferred loading
const Countdown = lazy(() => import("@/features/site/Countdown"));
const FAQ = lazy(() => import("@/features/site/FAQ"));
const ContactForm = lazy(() => import("@/features/site/ContactForm"));
const PushOptIn = lazy(() => import("@/components/PushOptIn"));
const Schedule = lazy(() => import("@/features/site/Schedule"));
const OtherEvents = lazy(() => import("@/features/site/OtherEvents"));
// Below-the-fold components
const LogoWall = lazy(() => import("@/features/site/LogoWall"));
const MapComponent = lazy(() => import("@/components/MapComponent"));

// Helper component for LogoWall with Suspense and ErrorBoundary
function SuspendedLogoWall({
  itemsType,
  items,
  stands,
  editionId,
}: {
  itemsType: "producers" | "sponsors" | "vendors";
  items: SliderItem[];
  stands?: OrganizationStands[];
  editionId?: string;
}) {
  // Get appropriate loading text based on itemsType
  const loadingText =
    itemsType === "producers"
      ? m.loading_producers()
      : itemsType === "vendors"
        ? m.loading_vendors()
        : m.loading_sponsors();

  const errorText =
    itemsType === "producers"
      ? m.error_loading_producers()
      : itemsType === "vendors"
        ? m.error_loading_vendors()
        : m.error_loading_sponsors();

  return (
    <SuspenseWithBoundary
      fallback={<div className="carousel-loading">{loadingText}</div>}
      errorFallback={<div className="carousel-error">{errorText}</div>}
    >
      <LogoWall itemsType={itemsType} items={items} stands={stands} editionId={editionId} />
    </SuspenseWithBoundary>
  );
}

export function HomePage() {
  const { variant, setVariant } = useVisualTheme();
  const { isMaintenanceMode } = useMaintenanceMode();

  // Fetch live edition data; keep an empty fallback shape on API errors.
  const { edition, hasEdition, hasLoadError, isLoaded } = useActiveEdition();
  const { producers, sponsors, vendors = [] } = edition;
  useEditionHeroImage(edition.hero_image);
  // Stand labels are an enhancement: a failed or empty lookup just shows no stand lines.
  const { data: standsData } = useQuery({
    ...editionStandsQueryOptions(edition.id),
    enabled: hasEdition && edition.id !== "",
  });
  const stands = standsData?.organizations;

  // Derive festival start/end dates from the active edition
  const { start: festivalDate, end: festivalEndDate } = useMemo(
    () => getFestivalDateRange(edition),
    [edition],
  );

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showBubbles, setShowBubbles] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("champagnefestival:bubbles") === "true";
    } catch {
      return false;
    }
  });
  const bubbleTapCountRef = useRef(0);
  const bubbleTapResetRef = useRef<number | null>(null);
  const bubbleKeyBufferRef = useRef("");

  useEffect(() => {
    try {
      window.localStorage.setItem("champagnefestival:bubbles", String(showBubbles));
    } catch {
      // Storage may be unavailable (disabled, sandboxed iframe, quota exceeded); bubble toggle just won't persist.
    }
  }, [showBubbles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.length !== 1) return;

      bubbleKeyBufferRef.current = `${bubbleKeyBufferRef.current}${event.key.toLowerCase()}`.slice(
        -7,
      );

      if (bubbleKeyBufferRef.current.endsWith("bubbles")) {
        setShowBubbles((enabled) => !enabled);
        bubbleKeyBufferRef.current = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (bubbleTapResetRef.current) {
        window.clearTimeout(bubbleTapResetRef.current);
      }
    };
  }, []);

  const handleBrandClick = useCallback(() => {
    bubbleTapCountRef.current += 1;

    if (bubbleTapResetRef.current) {
      window.clearTimeout(bubbleTapResetRef.current);
    }

    bubbleTapResetRef.current = window.setTimeout(() => {
      bubbleTapCountRef.current = 0;
      bubbleTapResetRef.current = null;
    }, 1400);

    if (bubbleTapCountRef.current >= 5) {
      setShowBubbles((enabled) => !enabled);
      bubbleTapCountRef.current = 0;
    }
  }, []);

  const nowTimestamp = useNow();
  const registrableEvents = useMemo(() => {
    const now = new Date(nowTimestamp);
    return (
      edition.events
        // Registration is offered for events that require it (capacity-limited),
        // and also for walk-in events that still have something to order (e.g.
        // a VIP package) — everyone else can just show up, no RSVP needed.
        .filter((event) => event.registration_required || event.products.length > 0)
        .filter((event) => {
          const eventEnd = endOfDay(new Date(`${event.date}T00:00:00`));
          return eventEnd >= now;
        })
        .filter(
          (event) =>
            !event.registrations_open_from || new Date(event.registrations_open_from) <= now,
        )
    );
  }, [edition.events, nowTimestamp]);

  // When nothing is registrable yet, the earliest upcoming opening tells visitors when to come back.
  const locale = getLocale() as "en" | "fr" | "nl";
  const registrationOpensOn = useMemo(() => {
    if (registrableEvents.length > 0) return null;
    const now = new Date(nowTimestamp);
    const openings = edition.events
      .filter((event) => event.registration_required || event.products.length > 0)
      .filter((event) => endOfDay(new Date(`${event.date}T00:00:00`)) >= now)
      .map((event) =>
        event.registrations_open_from ? new Date(event.registrations_open_from) : null,
      )
      .filter((opening): opening is Date => opening !== null && opening > now)
      .sort((a, b) => a.getTime() - b.getTime());
    const first = openings[0];
    return first ? formatDate(first, locale, { dateStyle: "long" }) : null;
  }, [edition.events, registrableEvents.length, locale, nowTimestamp]);

  const { name: venueName, address, postal_code: postalCode, city, country } = edition.venue;
  const venueLines = [address, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean);
  const venueMapsUrl = generateGoogleMapsUrl(venueName, address, postalCode, city, country);

  const festivalDateRange = formatDateRange(edition.dates, locale);
  // The hero kicker names the edition rather than repeating the festival name from the title.
  const firstFestivalDate = edition.dates[0];
  const heroKicker =
    hasEdition && firstFestivalDate
      ? m.hero_edition_kicker({
          month: formatDate(firstFestivalDate, locale, { month: "long" }),
          year: String(dayjs(firstFestivalDate).year()),
        })
      : m.festival_name();
  // Date and place repeat in the hero so visitors see them without scrolling on small screens.
  const heroFacts = hasEdition
    ? [festivalDateRange, [venueName, city].filter(Boolean).join(", ")].filter(Boolean)
    : [];
  const openRegistrationModal = useCallback(() => setShowRegistrationModal(true), []);
  // What the themed heroes add to the title: the way in (see the default hero below).
  const heroRegistration: HeroRegistrationProps = {
    facts: heroFacts,
    registration:
      registrableEvents.length > 0
        ? { label: m.registration_cta(), onRegister: openRegistrationModal }
        : undefined,
    note: registrationOpensOn ? m.registration_opens_on({ date: registrationOpensOn }) : null,
  };

  if (isMaintenanceMode) {
    return (
      <>
        <MaintenancePage flyerImage={edition.flyer_image} />
        {/* Preview-only switcher between the classic and refreshed visual designs */}
        <ThemeSwitcher variant={variant} onChange={setVariant} />
      </>
    );
  }

  // --- Main marketing page ---

  return (
    <div className="App">
      {/* Skip link for keyboard users */}
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>

      {showBubbles && (
        <SuspenseWithBoundary fallback={null} errorFallback={null}>
          <BubbleBackground />
        </SuspenseWithBoundary>
      )}

      {/* Header & Navigation */}
      {variant === "classic" ? <HeaderClassic /> : <Header onBrandClick={handleBrandClick} />}
      <PublicOfflineNotice />
      <AnnouncementBanner />
      <EventStructuredData />

      <main id="main-content">
        {/* Hero Section */}
        {variant === "affiche" ? (
          <AfficheHero
            {...heroRegistration}
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
            dateRange={hasEdition ? festivalDateRange : ""}
            venueName={hasEdition ? venueName : ""}
            venueLines={venueLines}
            mapsUrl={venueMapsUrl}
            producerNames={producers.map((producer) => producer.name)}
            countdown={
              hasEdition ? (
                <AppSuspense errorFallbackText={m.error_countdown()}>
                  <Countdown targetDate={festivalDate} endDate={festivalEndDate} />
                </AppSuspense>
              ) : null
            }
          />
        ) : variant === "billet" ? (
          <BilletHero
            {...heroRegistration}
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
            dateRange={hasEdition ? festivalDateRange : ""}
            year={hasEdition && firstFestivalDate ? String(dayjs(firstFestivalDate).year()) : null}
            venueName={hasEdition ? venueName : ""}
            venueLines={venueLines}
            mapsUrl={venueMapsUrl}
            countdown={
              hasEdition ? (
                <AppSuspense errorFallbackText={m.error_countdown()}>
                  <Countdown targetDate={festivalDate} endDate={festivalEndDate} />
                </AppSuspense>
              ) : null
            }
          />
        ) : variant === "remuage" ? (
          <RemuageHero
            {...heroRegistration}
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
          />
        ) : variant === "riviera" ? (
          <RivieraHero
            {...heroRegistration}
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
          />
        ) : variant === "cuvee" ? (
          <CuveeHero
            {...heroRegistration}
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
          />
        ) : variant === "classic" ? (
          <section className="hero" id="welcome">
            <h1 className="brand-title">{m.welcome_title()}</h1>
            <p className="hero-subtitle">{m.welcome_subtitle()}</p>
            {/* Entry is free and most events need no reservation, so discovering the festival
                leads and registering is the second action while it is open. */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="#what-we-do" variant="brand" className="rounded-full px-6 py-2">
                {m.welcome_learn_more()}
                <Icon icon={CircleArrowDownIcon} />
              </ButtonLink>
              {registrableEvents.length > 0 && (
                <Button
                  variant="light"
                  className="rounded-full px-6 py-2"
                  onClick={openRegistrationModal}
                >
                  <Icon icon={CalendarPlusIcon} />
                  {m.registration_cta()}
                </Button>
              )}
            </div>
          </section>
        ) : (
          <section className="hero" id="welcome">
            <div className="hero-content">
              <span className="hero-kicker">{heroKicker}</span>
              <h1 className="brand-title">{m.welcome_title()}</h1>
              <p className="hero-subtitle">{m.welcome_subtitle()}</p>
              {/* Holds its place while the edition loads, so the buttons below do not jump. */}
              {(heroFacts.length > 0 || !isLoaded) && (
                <p
                  className="hero-meta mb-6 flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold"
                  data-pending={isLoaded ? undefined : ""}
                  aria-hidden={isLoaded ? undefined : true}
                >
                  {isLoaded ? heroFacts.map((fact) => <span key={fact}>{fact}</span>) : "\u00a0"}
                </p>
              )}
              <div className="hero-actions">
                {/* Entry is free and most events need no reservation, so discovering the
                    festival leads and registering is the second action while it is open. */}
                <ButtonLink
                  href="#what-we-do"
                  variant="brand"
                  size="lg"
                  className="h-auto px-5 py-3 text-base"
                >
                  {m.welcome_learn_more()}
                  <Icon icon={CircleArrowDownIcon} />
                </ButtonLink>
                {registrableEvents.length > 0 ? (
                  <Button
                    variant="light"
                    size="lg"
                    className="h-auto px-5 py-3 text-base font-bold"
                    onClick={openRegistrationModal}
                  >
                    <Icon icon={CalendarPlusIcon} />
                    {m.registration_cta()}
                  </Button>
                ) : (
                  <ButtonLink
                    href="#schedule"
                    variant="light"
                    size="lg"
                    className="h-auto px-5 py-3 text-base font-bold"
                  >
                    {m.schedule_title()}
                  </ButtonLink>
                )}
              </div>
              {registrationOpensOn && (
                <p className="hero-meta mt-4 mb-0">
                  {m.registration_opens_on({ date: registrationOpensOn })}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Affiche's tile grid and Billet's ticket already carry the dates, the venue and the way in. */}
        {variant === "affiche" || variant === "billet" ? null : hasEdition ? (
          <FestivalFacts
            dateRange={festivalDateRange}
            venueName={edition.venue.name}
            city={edition.venue.city}
            canRegister={registrableEvents.length > 0}
            registrationOpensOn={registrationOpensOn}
            onRegister={openRegistrationModal}
          />
        ) : (
          !isLoaded && (
            // Holds the strip's height while the edition loads (about 290/230/100px on phone/tablet/
            // desktop), so the sections below do not jump when it appears.
            <div
              aria-hidden="true"
              className="min-h-72 border-y border-border site-md:min-h-56 site-lg:min-h-24"
            />
          )
        )}

        {/* What we do */}
        <section id="what-we-do" className="content-section">
          <div className="site-container mx-auto w-full text-center riviera:text-left">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="what-we-do-heading" title={m.what_we_do_title()} />
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                <p>
                  {m.what_we_do_description({
                    dateRange: festivalDateRange,
                    venueName: edition.venue.name,
                    city: edition.venue.city,
                  })}
                </p>
                <p>{m.what_we_do_for_everyone()}</p>
              </div>
            </div>
            {/* Features in full width to display side by side */}
            {variant === "remuage" ? (
              <RemuageFeatureRack
                items={featureItems.map((feature) => ({
                  id: feature.id,
                  title: feature.getTitle(),
                  description: feature.getDesc(),
                  icon: FEATURE_ICON_BY_ID[feature.id] ?? SparklesIcon,
                }))}
              />
            ) : variant === "riviera" ? (
              <RivieraFeatureGrid
                items={featureItems.map((feature) => ({
                  id: feature.id,
                  title: feature.getTitle(),
                  description: feature.getDesc(),
                  icon: FEATURE_ICON_BY_ID[feature.id] ?? SparklesIcon,
                }))}
              />
            ) : (
              <div className="features">
                {featureItems.map((feature) => (
                  <div key={feature.id} className="feature">
                    {variant !== "classic" && (
                      <span className="feature-icon" aria-hidden="true">
                        <Icon icon={FEATURE_ICON_BY_ID[feature.id] ?? SparklesIcon} />
                      </span>
                    )}
                    <h3>{feature.getTitle()}</h3>
                    <p>{feature.getDesc()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Next Festival with Countdown */}
        <section id="next-festival" className="content-section highlight-section">
          <div className="site-container mx-auto w-full text-center">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="next-festival-heading" title={m.next_festival_title()} />
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                {/* The mascot waits at her table beside the countdown when the column is wide
                    enough, and stands above it in narrow columns (mobile, Remuage's card). */}
                {variant === "affiche" || variant === "billet" ? (
                  // The mascot and the countdown already sit in Affiche's tile grid and on
                  // Billet's ticket at the top.
                  <p className="relative z-50 mb-0">
                    {hasEdition ? m.next_festival_description() : m.next_festival_none()}
                  </p>
                ) : (
                  <div className="@container">
                    <div className="flex flex-col items-center gap-6 @xl:flex-row @xl:gap-10">
                      <FestivalMascot crop="half" className="w-32 shrink-0 @xl:hidden" />
                      <FestivalMascot className="hidden w-36 shrink-0 @xl:block" />
                      <div className="min-w-0 flex-1">
                        {hasEdition ? (
                          <>
                            <AppSuspense errorFallbackText={m.error_countdown()}>
                              <Countdown targetDate={festivalDate} endDate={festivalEndDate} />
                            </AppSuspense>
                            <p className="relative z-50 mb-6">{m.next_festival_description()}</p>
                          </>
                        ) : (
                          <p className="relative z-50 mb-6">{m.next_festival_none()}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section id="schedule" className="content-section">
          <div className="site-container mx-auto w-full">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading
              id="schedule-heading"
              title={m.schedule_title()}
              subtitle={m.schedule_description()}
            />
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                {hasLoadError ? (
                  <Alert variant="danger" className="mb-0">
                    {m.error_schedule()}
                  </Alert>
                ) : (
                  <AppSuspense errorFallbackText={m.error_schedule()}>
                    {variant === "billet" ? (
                      <BilletProgramme events={edition.events} />
                    ) : (
                      <Schedule events={edition.events} />
                    )}
                  </AppSuspense>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Other Events */}
        <AppSuspense errorFallbackText={m.other_events_error_load()}>
          <OtherEvents />
        </AppSuspense>

        {/* Producers logo wall */}
        {producers.length > 0 && (
          <section id="producers" className="content-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading id="producers-heading" title={m.producers_title()} />
              <SuspendedLogoWall
                itemsType="producers"
                items={producers}
                stands={stands}
                editionId={edition.id}
              />
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section id="faq" className="content-section">
          <div className="site-container mx-auto w-full">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="faq-heading" title={m.faq_title()} />
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                <AppSuspense errorFallbackText={m.error_faq()}>
                  <FAQ />
                </AppSuspense>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Map - Moved here */}
        <section id="map" className="content-section">
          <div className="site-container mx-auto w-full">
            {/* Replaced h2 with SectionHeading */}
            <SectionHeading id="map-heading" title={m.location_title()} />
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                {(venueName || venueLines.length > 0) && (
                  <div
                    data-slot="venue-details"
                    className="mb-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      {venueName && <p className="mb-0 text-lg font-semibold">{venueName}</p>}
                      {venueLines.length > 0 && (
                        <p className="mb-0 text-muted-foreground">{venueLines.join(", ")}</p>
                      )}
                    </div>
                    {venueMapsUrl && (
                      <ButtonLink
                        href={venueMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        size="sm"
                      >
                        <Icon icon={ExternalLinkIcon} />
                        {m.location_open_in_maps()}
                      </ButtonLink>
                    )}
                  </div>
                )}
                <LoadWhenVisible
                  placeholder={
                    <div
                      data-slot="location-map-placeholder"
                      className="aspect-video rounded-md border border-border bg-muted"
                    />
                  }
                >
                  <SuspenseWithBoundary
                    fallback={
                      <div className="map-loading flex items-center justify-center py-12">
                        <div className="text-center">
                          <Spinner variant="primary" />
                          <p className="mt-2">{m.loading()}</p>
                        </div>
                      </div>
                    }
                    errorFallback={<div className="map-error">{m.error_loading_map()}</div>}
                  >
                    <MapComponent
                      location={edition.venue.name}
                      address={edition.venue.address}
                      city={edition.venue.city}
                      postalCode={edition.venue.postal_code}
                      country={edition.venue.country}
                      coordinates={{ lat: edition.venue.lat, lng: edition.venue.lng }}
                    />
                  </SuspenseWithBoundary>
                </LoadWhenVisible>
              </div>
            </div>
          </div>
        </section>

        {/* Vendors logo wall */}
        {vendors.length > 0 && (
          <section id="vendors" className="content-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading id="vendors-heading" title={m.vendors_title()} />
              <SuspendedLogoWall
                itemsType="vendors"
                items={vendors}
                stands={stands}
                editionId={edition.id}
              />
            </div>
          </section>
        )}
        {/* Sponsors logo row */}
        {sponsors.length > 0 && (
          <section id="sponsors" className="content-section highlight-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading id="sponsors-heading" title={m.sponsors_title()} />
              <SuspendedLogoWall
                itemsType="sponsors"
                items={sponsors}
                stands={stands}
                editionId={edition.id}
              />
            </div>
          </section>
        )}

        {/* Contact Form */}
        <section id="contact" className="content-section">
          <div className="site-container mx-auto w-full">
            {/* Replaced h2 with SectionHeading and added subtitle */}
            <SectionHeading
              id="contact-heading"
              title={m.contact_title()}
              subtitle={m.contact_intro()}
            />
            {/* Removed redundant <p> tag */}
            <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter justify-center riviera:justify-start">
              <div className="site-content-column site-md:w-content-md site-lg:w-content-lg">
                <AppSuspense errorFallbackText={m.error_contact()}>
                  <ContactForm />
                </AppSuspense>
                <div className="mt-6">
                  <ContactInfo />
                </div>
                {/* Web Push opt-in (#941) — self-contained, renders nothing when
                    unsupported or VAPID isn't configured server-side. */}
                <div id="notifications" className="mt-8 scroll-mt-24">
                  <SuspenseWithBoundary fallback={null} errorFallback={null}>
                    <PushOptIn />
                  </SuspenseWithBoundary>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VIP Registrations Section — only while something is, or will soon be, registrable */}
        {(registrableEvents.length > 0 || registrationOpensOn) && (
          <section id="registrations" className="content-section highlight-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading
                id="registrations-heading"
                title={m.registration_title()}
                subtitle={m.registration_description()}
              />
              {registrableEvents.length > 0 ? (
                <Button
                  data-slot="registration-cta"
                  variant="warning"
                  size="lg"
                  className="px-12 font-bold"
                  onClick={openRegistrationModal}
                >
                  <Icon icon={CalendarPlusIcon} />
                  {m.registration_cta()}
                </Button>
              ) : (
                <p data-slot="registration-opens" className="mb-0 text-lg font-semibold">
                  {m.registration_opens_on({ date: registrationOpensOn ?? "" })}
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* VIP Registration Modal */}
      <LazyRegistrationModal
        show={showRegistrationModal}
        onHide={() => setShowRegistrationModal(false)}
        event={registrableEvents[0] ?? null}
      />

      {/* Preview-only switcher between the classic and refreshed visual designs */}
      <ThemeSwitcher variant={variant} onChange={setVariant} />
    </div>
  );
}
