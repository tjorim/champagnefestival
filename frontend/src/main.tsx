import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CircleArrowDownIcon,
  CircleUserRoundIcon,
  CupSodaIcon,
  ExternalLinkIcon,
  MapIcon,
  ScanQrCodeIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  WatchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Button, ButtonLink } from "@/components/ui/button";
import React, { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, RouterProvider } from "@tanstack/react-router";
import { AuthProvider as OidcAuthProvider } from "react-oidc-context";

import "./styles/tailwind.css";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

import { createOidcConfig } from "./config/oidc";
import { AuthProvider } from "./contexts/AuthContext";

import Footer from "./components/Footer";
import Header from "./components/Header";
import HeaderClassic from "./components/HeaderClassic";
import ThemeSwitcher from "./components/ThemeSwitcher";
import RivieraFeatureGrid from "./components/riviera/RivieraFeatureGrid";
import RivieraHero from "./components/riviera/RivieraHero";
import CuveeHero from "./components/cuvee/CuveeHero";
import RemuageFeatureRack from "./components/remuage/RemuageFeatureRack";
import RemuageHero from "./components/remuage/RemuageHero";
import EventStructuredData from "./components/JsonLd";
import FestivalFacts from "./components/FestivalFacts";
import FestivalMascot from "./components/FestivalMascot";
import ContactInfo from "./components/ContactInfo";
import SectionHeading from "./components/SectionHeading";
import SuspenseWithBoundary from "./components/SuspenseWithBoundary";
import RegistrationModal from "./components/RegistrationModal";
import AnnouncementBanner from "./components/AnnouncementBanner";
import PushOptIn from "./components/PushOptIn";

import LanguageSwitcher from "./components/LanguageSwitcher";
import MaintenancePage from "./components/MaintenancePage";
import { useLanguage } from "./hooks/useLanguage";
import { useMaintenanceMode } from "./hooks/useMaintenanceMode";
import { useNoIndex } from "./hooks/useNoIndex";
import { initializeVisualTheme, useVisualTheme } from "./hooks/useVisualTheme";
import { getFestivalDateRange, useActiveEdition } from "./hooks/useActiveEdition";
import { m } from "./paraglide/messages";
import { getLocale } from "./paraglide/runtime";
import { featureItems } from "./config/features";
import { dayjs, endOfDay, formatDateRange } from "./utils/dateUtils";
import { createAppRouter } from "./router";
import { generateGoogleMapsUrl } from "./utils/maps";

const FEATURE_ICON_BY_ID: Record<number, LucideIcon> = {
  1: CupSodaIcon,
  2: CalendarDaysIcon,
  3: UsersIcon,
};

// Must come after the CSS imports above so the theme <link> is appended after the bundled
// stylesheets: both declare their rules in the `components` layer, where the later one wins ties.
initializeVisualTheme();

// Components - Lazy loaded
const BubbleBackground = lazy(() => import("./components/BubbleBackground"));
// Important visible components with deferred loading
const Countdown = lazy(() => import("./components/Countdown"));
const FAQ = lazy(() => import("./components/FAQ"));
const ContactForm = lazy(() => import("./components/ContactForm"));
const Schedule = lazy(() => import("./components/Schedule"));
const OtherEvents = lazy(() => import("./components/OtherEvents"));
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const CheckInPage = lazy(() => import("./components/CheckInPage"));
const VenuePlanPage = lazy(() => import("./components/VenuePlanPage"));
const PrivacyPolicyPage = lazy(() => import("./components/PrivacyPolicyPage"));
const PebblePairPage = lazy(() => import("./components/PebblePairPage"));
const MyAccountPage = lazy(() => import("./components/MyAccountPage"));
// Below-the-fold components
const LogoWall = lazy(() => import("./components/LogoWall"));
const MapComponent = lazy(() => import("./components/MapComponent"));

interface AppSuspenseProps {
  children: React.ReactNode;
  errorFallbackText: string;
}

function AppSuspense({ children, errorFallbackText }: AppSuspenseProps) {
  return (
    <SuspenseWithBoundary
      fallback={
        <div className="text-center p-6">
          <Spinner label={m.loading()} variant="light" />
        </div>
      }
      errorFallback={
        <Alert variant="danger" className="m-6 text-center">
          {errorFallbackText}
        </Alert>
      }
    >
      {children}
    </SuspenseWithBoundary>
  );
}

/** Minimal top-bar shown on standalone admin / check-in pages */
function StandaloneNavBar({ icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <nav className="standalone-navbar flex flex-wrap items-center justify-between fixed inset-x-0 top-0 z-header px-4 py-2">
      <div className="site-fluid-container mx-auto w-full px-3 flex justify-between items-center gap-2">
        <span className="standalone-navbar-brand me-4 whitespace-nowrap text-xl font-bold mb-0">
          <Icon icon={icon} className="me-2" />
          {title}
        </span>
        <div className="standalone-navbar-actions flex gap-2 items-center">
          <LanguageSwitcher />
          <ButtonLink render={<Link to="/" />} variant="outline" size="sm">
            <Icon icon={ArrowLeftIcon} />
            {m.back_to_site()}
          </ButtonLink>
        </div>
      </div>
    </nav>
  );
}

// Helper component for LogoWall with Suspense and ErrorBoundary
function SuspendedLogoWall({
  itemsType,
  items,
}: {
  itemsType: "producers" | "sponsors" | "vendors";
  items: Array<{ id: number; name: string; image: string }>;
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
      <LogoWall itemsType={itemsType} items={items} />
    </SuspenseWithBoundary>
  );
}

/** Route component for /admin */
function AdminPage() {
  useNoIndex();
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={ShieldIcon} title={m.admin_title()} />
      <main id="main-content" className="standalone-main">
        <AppSuspense errorFallbackText={m.admin_error_load_dashboard()}>
          <AdminDashboard visible={true} />
        </AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /check-in */
function CheckInRoute() {
  useNoIndex();
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={ScanQrCodeIcon} title={m.checkin_title()} />
      <main id="main-content" className="standalone-main">
        <AppSuspense errorFallbackText={m.admin_error_load_checkin()}>
          <CheckInPage />
        </AppSuspense>
      </main>
    </div>
  );
}

function VenuePlanRoute() {
  useNoIndex();
  return (
    <div className="App standalone-app">
      <StandaloneNavBar icon={MapIcon} title={m.venue_plan_title()} />
      <main id="main-content" className="standalone-main">
        <AppSuspense errorFallbackText={m.venue_plan_error()}>
          <VenuePlanPage />
        </AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /privacy */
function PrivacyPolicyRoute() {
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={ShieldCheckIcon} title={m.privacy_title()} />
      <main id="main-content" className="standalone-main standalone-document-main">
        <AppSuspense errorFallbackText={m.error_loading_privacy()}>
          <PrivacyPolicyPage />
        </AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /pebble-pair */
function PebblePairRoute() {
  useNoIndex();
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={WatchIcon} title={m.pebble_pair_title()} />
      <main id="main-content" className="standalone-main">
        <AppSuspense errorFallbackText={m.pebble_pair_error()}>
          <PebblePairPage />
        </AppSuspense>
      </main>
    </div>
  );
}

/**
 * Route component for /me — unlinked, direct-URL-only self-service page for
 * visitors, members, and volunteers alike (the latter two via OIDC). Also
 * the target of the confirmation/magic-link emails' `?token=` links (see
 * backend/app/email.py) — no separate /my-registrations route.
 */
function MyAccountRoute() {
  useNoIndex();
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={CircleUserRoundIcon} title={m.my_account_title()} />
      <main id="main-content" className="standalone-main">
        <AppSuspense errorFallbackText={m.my_account_delete_error()}>
          <MyAccountPage />
        </AppSuspense>
      </main>
    </div>
  );
}

function App() {
  // Use custom hooks for language
  useLanguage();
  const { variant, setVariant } = useVisualTheme();
  const { isMaintenanceMode } = useMaintenanceMode();

  // Fetch live edition data; keep an empty fallback shape on API errors.
  const { edition, hasEdition, hasLoadError } = useActiveEdition();
  const { producers, sponsors, vendors = [] } = edition;

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

  const registrableEvents = useMemo(() => {
    const now = new Date();
    return (
      edition.events
        // Registration is offered for events that require it (capacity-limited),
        // and also for walk-in events that still have something to order (e.g.
        // a VIP package) — everyone else can just show up, no RSVP needed.
        .filter((event) => event.registrationRequired || event.products.length > 0)
        .filter((event) => {
          const eventEnd = endOfDay(new Date(`${event.date}T00:00:00`));
          return eventEnd >= now;
        })
        .filter(
          (event) => !event.registrationsOpenFrom || new Date(event.registrationsOpenFrom) <= now,
        )
    );
  }, [edition.events]);

  // When nothing is registrable yet, the earliest upcoming opening tells visitors when to come back.
  const locale = getLocale() as "en" | "fr" | "nl";
  const registrationOpensOn = useMemo(() => {
    if (registrableEvents.length > 0) return null;
    const now = new Date();
    const openings = edition.events
      .filter((event) => event.registrationRequired || event.products.length > 0)
      .filter((event) => endOfDay(new Date(`${event.date}T00:00:00`)) >= now)
      .map((event) => (event.registrationsOpenFrom ? new Date(event.registrationsOpenFrom) : null))
      .filter((opening): opening is Date => opening !== null && opening > now)
      .sort((a, b) => a.getTime() - b.getTime());
    const first = openings[0];
    return first ? dayjs(first).locale(locale).format("D MMMM YYYY") : null;
  }, [edition.events, registrableEvents.length, locale]);

  const { venueName, address, postalCode, city, country } = edition.venue;
  const venueLines = [address, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean);
  const venueMapsUrl = generateGoogleMapsUrl(venueName, address, postalCode, city, country);

  const festivalDateRange = formatDateRange(edition.dates, locale);
  // The hero kicker names the edition rather than repeating the festival name from the title.
  const firstFestivalDate = edition.dates[0];
  const heroKicker =
    hasEdition && firstFestivalDate
      ? m.hero_edition_kicker({
          month: dayjs(firstFestivalDate).locale(locale).format("MMMM"),
          year: String(dayjs(firstFestivalDate).year()),
        })
      : m.festival_name();
  const openRegistrationModal = useCallback(() => setShowRegistrationModal(true), []);

  if (isMaintenanceMode) {
    return (
      <>
        <MaintenancePage />
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
      <AnnouncementBanner />
      <EventStructuredData />

      <main id="main-content">
        {/* Hero Section */}
        {variant === "remuage" ? (
          <RemuageHero
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
          />
        ) : variant === "riviera" ? (
          <RivieraHero
            festivalName={heroKicker}
            title={m.welcome_title()}
            subtitle={m.welcome_subtitle()}
            learnMoreLabel={m.welcome_learn_more()}
            scheduleLabel={m.schedule_title()}
          />
        ) : variant === "cuvee" ? (
          <CuveeHero
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
            <ButtonLink href="#what-we-do" variant="brand" className="rounded-full px-6 py-2">
              {m.welcome_learn_more()}
              <Icon icon={CircleArrowDownIcon} />
            </ButtonLink>
          </section>
        ) : (
          <section className="hero" id="welcome">
            <div className="hero-content">
              <span className="hero-kicker">{heroKicker}</span>
              <h1 className="brand-title">{m.welcome_title()}</h1>
              <p className="hero-subtitle">{m.welcome_subtitle()}</p>
              <div className="hero-actions">
                <ButtonLink
                  href="#what-we-do"
                  variant="brand"
                  size="lg"
                  className="h-auto px-5 py-3 text-base"
                >
                  {m.welcome_learn_more()}
                  <Icon icon={CircleArrowDownIcon} />
                </ButtonLink>
                <ButtonLink
                  href="#schedule"
                  variant="light"
                  size="lg"
                  className="h-auto px-5 py-3 text-base font-bold"
                >
                  {m.schedule_title()}
                </ButtonLink>
              </div>
            </div>
          </section>
        )}

        {hasEdition && (
          <FestivalFacts
            dateRange={festivalDateRange}
            venueName={edition.venue.venueName}
            city={edition.venue.city}
            canRegister={registrableEvents.length > 0}
            registrationOpensOn={registrationOpensOn}
            onRegister={openRegistrationModal}
          />
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
                    venueName: edition.venue.venueName,
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
                    <Schedule events={edition.events} />
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
              <SuspendedLogoWall itemsType="producers" items={producers} />
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
                    location={edition.venue.venueName}
                    address={edition.venue.address}
                    city={edition.venue.city}
                    postalCode={edition.venue.postalCode}
                    country={edition.venue.country}
                    coordinates={edition.venue.coordinates}
                  />
                </SuspenseWithBoundary>
              </div>
            </div>
          </div>
        </section>

        {/* Vendors logo wall */}
        {vendors.length > 0 && (
          <section id="vendors" className="content-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading id="vendors-heading" title={m.vendors_title()} />
              <SuspendedLogoWall itemsType="vendors" items={vendors} />
            </div>
          </section>
        )}
        {/* Sponsors logo row */}
        {sponsors.length > 0 && (
          <section id="sponsors" className="content-section highlight-section">
            <div className="site-container mx-auto w-full text-center">
              <SectionHeading id="sponsors-heading" title={m.sponsors_title()} />
              <SuspendedLogoWall itemsType="sponsors" items={sponsors} />
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
                  <PushOptIn />
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
      <RegistrationModal
        show={showRegistrationModal}
        onHide={() => setShowRegistrationModal(false)}
        event={registrableEvents[0] ?? null}
      />

      {/* Preview-only switcher between the classic and refreshed visual designs */}
      <ThemeSwitcher variant={variant} onChange={setVariant} />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createAppRouter({
  App,
  AdminPage,
  CheckInRoute,
  PrivacyPolicyRoute,
  PebblePairRoute,
  MyAccountRoute,
  VenuePlanRoute,
  queryClient,
});

const oidcConfig = createOidcConfig({
  navigateTo: (to) => router.navigate({ to }),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the App
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found");
  throw new Error("Root element not found");
}

async function enableMocking(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_MSW === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "warn" });
    console.info("[MSW] Mock Service Worker active — using mock API");
  }
}

// Registers the production service worker (src/sw.ts), including push handlers.
// Skipped outside production so it never fights the dev server or the
// opt-in MSW mock worker above, which only ever runs in DEV.
function registerServiceWorker(): void {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err: unknown) => console.error("[SW] Registration failed:", err));
  }
}

function renderApp(): void {
  ReactDOM.createRoot(rootElement!).render(
    <React.StrictMode>
      <OidcAuthProvider {...oidcConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </OidcAuthProvider>
    </React.StrictMode>,
  );
}

registerServiceWorker();

enableMocking()
  .then(renderApp)
  .catch((err: unknown) => {
    console.error("[MSW] Service Worker failed to start, rendering without mocks:", err);
    renderApp();
  });
