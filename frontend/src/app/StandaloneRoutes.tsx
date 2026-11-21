import StaffTasks from "@/components/StaffTasks";
import {
  ArrowLeftIcon,
  CircleUserRoundIcon,
  MailCheckIcon,
  MapIcon,
  ScanQrCodeIcon,
  ShieldCheckIcon,
  ShieldIcon,
  WatchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { AppSuspense } from "@/components/AppSuspense";
import { ButtonLink } from "@/components/ui/button";
import React, { lazy } from "react";
import { localizedPublicPath } from "@/config/localePath";
import LanguageSwitcher from "@/app/layout/LanguageSwitcher";
import { useNoIndex } from "@/app/layout/useNoIndex";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const AdminDashboard = lazy(() => import("@/features/admin/shell/AdminDashboard"));
const CheckInPage = lazy(() => import("@/features/check-in/CheckInPage"));
const VenuePlanPage = lazy(() => import("@/features/venue-plan/VenuePlanPage"));
const PrivacyPolicyPage = lazy(() => import("@/features/legal/PrivacyPolicyPage"));
const PebblePairPage = lazy(() => import("@/features/pebble/PebblePairPage"));
const MyAccountPage = lazy(() => import("@/features/my-account/MyAccountPage"));
const EmailConsentConfirmPage = lazy(
  () => import("@/features/email-preferences/EmailConsentConfirmPage"),
);
const EmailUnsubscribePage = lazy(
  () => import("@/features/email-preferences/EmailUnsubscribePage"),
);

/** Minimal top-bar shown on standalone admin / check-in pages */
function StandaloneNavBar({ icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <nav className="standalone-navbar flex flex-wrap items-center justify-between fixed inset-x-0 top-0 z-header px-4 py-2">
      <div className="site-fluid-container mx-auto w-full px-3 flex justify-between items-center gap-2">
        <span className="standalone-navbar-brand me-2 flex min-w-0 flex-1 items-center text-xl font-bold mb-0">
          <Icon icon={icon} className="me-2 shrink-0" />
          <span className="min-w-0 shrink truncate">{title}</span>
        </span>
        <div className="standalone-navbar-actions flex shrink-0 gap-2 items-center">
          <LanguageSwitcher />
          <ButtonLink
            render={<a href={localizedPublicPath("/", getLocale())} />}
            variant="outline"
            size="sm"
          >
            <Icon icon={ArrowLeftIcon} />
            {/* Icon-only on phones so the title keeps its room; the text stays the accessible name. */}
            <span className="sr-only site-sm:not-sr-only">{m.back_to_site()}</span>
          </ButtonLink>
        </div>
      </div>
    </nav>
  );
}

/** The shared shell of the standalone pages: skip link, navigation bar and a suspended, error-bounded main area. */
function StandaloneRoute({
  icon,
  title,
  errorFallbackText,
  children,
}: {
  icon: LucideIcon;
  title: string;
  errorFallbackText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="App standalone-app">
      <a href="#main-content" className="skip-link">
        {m.accessibility_skip_to_content()}
      </a>
      <StandaloneNavBar icon={icon} title={title} />
      <main id="main-content" className="standalone-main">
        <div className="site-container mx-auto w-full px-4 pt-4">
          <StaffTasks />
        </div>
        <AppSuspense errorFallbackText={errorFallbackText}>{children}</AppSuspense>
      </main>
    </div>
  );
}

/** Route component for /admin */
export function AdminPage() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={ShieldIcon}
      title={m.admin_title()}
      errorFallbackText={m.admin_error_load_dashboard()}
    >
      <AdminDashboard visible={true} />
    </StandaloneRoute>
  );
}

/** Route component for /check-in */
export function CheckInRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={ScanQrCodeIcon}
      title={m.checkin_title()}
      errorFallbackText={m.admin_error_load_checkin()}
    >
      <CheckInPage />
    </StandaloneRoute>
  );
}

export function VenuePlanRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={MapIcon}
      title={m.venue_plan_title()}
      errorFallbackText={m.venue_plan_error()}
    >
      <VenuePlanPage />
    </StandaloneRoute>
  );
}

/** Route component for /privacy */
export function PrivacyPolicyRoute() {
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
export function PebblePairRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={WatchIcon}
      title={m.pebble_pair_title()}
      errorFallbackText={m.pebble_pair_error()}
    >
      <PebblePairPage />
    </StandaloneRoute>
  );
}

/**
 * Route component for /me — unlinked, direct-URL-only self-service page for
 * visitors, members, and volunteers alike (the latter two via OIDC). Also
 * the target of the confirmation/magic-link emails' `?token=` links (see
 * backend/app/email.py) — no separate /my-registrations route.
 */
export function MyAccountRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={CircleUserRoundIcon}
      title={m.my_account_title()}
      errorFallbackText={m.my_account_delete_error()}
    >
      <MyAccountPage />
    </StandaloneRoute>
  );
}

/** Route component for /email-unsubscribe, where the unsubscribe link of member mail lands (#1407). */
export function EmailUnsubscribeRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={MailCheckIcon}
      title={m.email_unsubscribe_title()}
      errorFallbackText={m.email_unsubscribe_error()}
    >
      <EmailUnsubscribePage />
    </StandaloneRoute>
  );
}

/** Route component for /email-consent, the target of the emailed consent confirmation link (#1408). */
export function EmailConsentRoute() {
  useNoIndex();
  return (
    <StandaloneRoute
      icon={MailCheckIcon}
      title={m.email_consent_confirm_title()}
      errorFallbackText={m.email_consent_confirm_error()}
    >
      <EmailConsentConfirmPage />
    </StandaloneRoute>
  );
}
