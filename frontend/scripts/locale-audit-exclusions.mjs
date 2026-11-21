// Whole files that hold no interface copy: authored data and development fixtures. Keep this list short and
// give each entry a reason; a trailing slash matches a directory.
export const excludedFiles = {
  "mocks/": "MSW development fixtures, loaded only when VITE_MSW is set",
};
// Functions that only log for developers; their string arguments are not interface copy.
export const diagnosticCallees = ["devError"];
// Exact source/value exclusions. Never approve a whole component or directory for visible copy.
export const exclusions = {
  "components/ui/sidebar.tsx": {
    "; path=/; max-age=":
      "HTTP cookie attributes for sidebar state persistence, not interface copy",
  },
  "features/signage/SlideRenderer.tsx": {
    "Arial, sans-serif": "CSS font-family stack from the validated signage font allow-list",
    "Georgia, serif": "CSS font-family stack from the validated signage font allow-list",
    "linear-gradient(135deg,": "CSS gradient syntax for the authored template background",
  },
  "app/layout/BrandWordmark.tsx": {
    Champagne: "fixed application brand",
    festival: "fixed application brand",
  },
  "features/check-in/CheckInPage.tsx": {
    "×": "multiplication sign before a quantity",
    Bearer: "HTTP authorization scheme",
  },
  "features/my-account/MyMembership.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "features/my-account/MyRegistrationsPage.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
    "×": "multiplication sign before a quantity",
  },
  "features/admin/registrations/RegistrationNewPersonPanel.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "features/registration/RegistrationModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "features/site/FestivalMascot.tsx": {
    "(min-width: 768px) 9rem, 8rem": "image sizes attribute",
  },
  "app/layout/Footer.tsx": {
    "&copy;": "copyright sign entity",
  },
  "components/MapComponent.tsx": {
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors':
      "provider attribution",
  },
  "features/venue-plan/VenuePlanPage.tsx": {
    "hidden lg:block": "Responsive CSS class list for the floor-plan table list",
    "translate(-50%, -50%) rotate(": "CSS transform",
    Bearer: "HTTP authorization scheme",
  },
  "features/admin/shared/AdminDataTable.tsx": {
    "button, a, input, [role=menuitem]": "CSS selector",
    "×": "filter chip close sign",
  },
  "features/admin/shared/ComposerManagement.tsx": {
    "https://…": "URL input example",
  },
  "features/admin/editions/ItemModal.tsx": {
    "https://…": "URL input example",
  },
  "features/admin/editions/EventModal.tsx": {
    title_nl: "form field key",
    description_nl: "form field key",
    title_fr: "form field key",
    description_fr: "form field key",
    title_en: "form field key",
    description_en: "form field key",
  },
  "features/admin/editions/PollQuestionCard.tsx": {
    titleNl: "form field key",
    descriptionNl: "form field key",
    titleFr: "form field key",
    descriptionFr: "form field key",
    titleEn: "form field key",
    descriptionEn: "form field key",
  },
  "features/admin/venue/LayoutEditor.tsx": {
    "(max-width: 1199px), (max-height: 599px)":
      "CSS media query for scrolling the floor-plan inspector into view, not interface copy",
    "border-color 0.15s, opacity 0.15s": "CSS transition",
    "border-color 0.15s": "CSS transition",
  },
  "features/admin/people/MemberFormModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "features/admin/people/PersonFormModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "features/admin/people/PeopleManagement.tsx": {
    "hidden md:table-cell": "CSS class list",
    "hidden lg:table-cell": "CSS class list",
  },
  "features/admin/registrations/RegistrationList.tsx": {
    "hidden md:table-cell": "CSS class list",
    "hidden lg:table-cell": "CSS class list",
  },
  "features/admin/registrations/RegistrationDetail.tsx": {
    "×": "multiplication sign before a quantity",
  },
  "features/admin/insights/analyticsChartExport.ts": {
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif': "CSS font stack",
  },
  "features/site/affiche/AfficheHero.tsx": {
    "(min-width: 992px) 18rem, 40vw": "image sizes attribute",
  },
  "features/site/billet/BilletHero.tsx": {
    "N°": "decorative serial prefix on the ticket barcode, hidden from assistive technology",
  },
  "features/site/cuvee/CuveeHero.tsx": {
    CF: "brand monogram",
  },
  "features/site/riviera/RivieraHero.tsx": {
    CF: "brand monogram",
  },
  "config/contact.ts": {
    "See schedule": "unused fallback; opening hours come from the active edition",
  },
  "config/oidc.ts": {
    "openid profile email": "OIDC scopes",
  },
  "config/schedule.ts": {
    friday: "day key, not rendered",
    saturday: "day key, not rendered",
    sunday: "day key, not rendered",
  },
  "config/site.ts": {
    Champagnefestival: "fixed application brand",
    "Annual champagnefestival featuring tastings, masterclasses, and gourmet food pairings":
      "metadata constant not used by the interface",
    "Champagnefestival Team": "fixed application brand",
  },
  "hooks/useMaintenanceMode.ts": {
    "Failed to load settings:": "internal diagnostic",
  },
  "app/layout/useNoIndex.ts": {
    "noindex, nofollow": "robots meta content",
  },
  "hooks/useOtherEvents.ts": {
    "upcoming editions[": "internal validation context",
  },
  "app/theme/useVisualTheme.ts": {
    'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]': "CSS selector",
    'meta[name="theme-color"][media="(prefers-color-scheme: light)"]': "CSS selector",
  },
  "sw/push.ts": {
    Champagnefestival: "fixed application brand",
  },
  "features/admin/shared/emailComposer.ts": {
    ",\nChampagnefestival": "fixed application brand in the email signature",
  },
  "features/my-account/MyAccountPage.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "features/pebble/PebblePairPage.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "features/admin/shell/AdminDashboard.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "app/router.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "app/providers/LiveUpdatesProvider.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "lib/api/emailConsentApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "lib/api/liveStream.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "features/my-account/meApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "lib/api/myVolunteerApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "lib/api/publicRegistrationApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
};
