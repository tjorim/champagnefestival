// Whole files that hold no interface copy: authored data and development fixtures. Keep this list short and
// give each entry a reason; a trailing slash matches a directory.
export const excludedFiles = {
  "mocks/": "MSW development fixtures, loaded only when VITE_MSW is set",
};
// Functions that only log for developers; their string arguments are not interface copy.
export const diagnosticCallees = ["devError"];
// Exact source/value exclusions. Never approve a whole component or directory for visible copy.
export const exclusions = {
  "components/BrandWordmark.tsx": {
    Champagne: "fixed application brand",
    festival: "fixed application brand",
  },
  "components/CheckInPage.tsx": {
    "×": "multiplication sign before a quantity",
    Bearer: "HTTP authorization scheme",
  },
  "components/MyRegistrationsPage.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
    "×": "multiplication sign before a quantity",
  },
  "components/RegistrationModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "components/FestivalMascot.tsx": {
    "(min-width: 768px) 9rem, 8rem": "image sizes attribute",
  },
  "components/Footer.tsx": {
    "&copy;": "copyright sign entity",
  },
  "components/MapComponent.tsx": {
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors':
      "provider attribution",
  },
  "components/VenuePlanPage.tsx": {
    "translate(-50%, -50%) rotate(": "CSS transform",
    Bearer: "HTTP authorization scheme",
  },
  "components/admin/AdminDataTable.tsx": {
    "button, a, input, [role=menuitem]": "CSS selector",
    "×": "filter chip close sign",
  },
  "components/admin/ComposerManagement.tsx": {
    "https://…": "URL input example",
  },
  "components/admin/ItemModal.tsx": {
    "https://…": "URL input example",
  },
  "components/admin/EventModal.tsx": {
    titleNl: "form field key",
    descriptionNl: "form field key",
    titleFr: "form field key",
    descriptionFr: "form field key",
    titleEn: "form field key",
    descriptionEn: "form field key",
  },
  "components/admin/LayoutEditor.tsx": {
    "border-color 0.15s, opacity 0.15s": "CSS transition",
    "border-color 0.15s": "CSS transition",
  },
  "components/admin/MemberFormModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "components/admin/PersonFormModal.tsx": {
    Nederlands: "language autonym",
    Français: "language autonym",
    English: "language autonym",
  },
  "components/admin/PeopleManagement.tsx": {
    "hidden md:table-cell": "CSS class list",
    "hidden lg:table-cell": "CSS class list",
  },
  "components/admin/RegistrationList.tsx": {
    "hidden md:table-cell": "CSS class list",
    "hidden lg:table-cell": "CSS class list",
  },
  "components/admin/RegistrationDetail.tsx": {
    "×": "multiplication sign before a quantity",
  },
  "components/admin/analyticsChartExport.ts": {
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif': "CSS font stack",
  },
  "components/cuvee/CuveeHero.tsx": {
    CF: "brand monogram",
  },
  "components/riviera/RivieraHero.tsx": {
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
  "hooks/useAdminRegistrationActions.ts": {
    "remaining seats": "matches the backend 409 text until the API returns a stable error code",
  },
  "hooks/useMaintenanceMode.ts": {
    "Failed to load settings:": "internal diagnostic",
  },
  "hooks/useNoIndex.ts": {
    "noindex, nofollow": "robots meta content",
  },
  "hooks/useOtherEvents.ts": {
    "upcoming editions[": "internal validation context",
  },
  "hooks/useVisualTheme.ts": {
    'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]': "CSS selector",
    'meta[name="theme-color"][media="(prefers-color-scheme: light)"]': "CSS selector",
  },
  "sw/push.ts": {
    Champagnefestival: "fixed application brand",
  },
  "utils/emailComposer.ts": {
    ",\nChampagnefestival": "fixed application brand in the email signature",
  },
  "components/MyAccountPage.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "components/PebblePairPage.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "components/admin/AdminDashboard.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "router.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "state/LiveUpdatesProvider.tsx": {
    Bearer: "HTTP authorization scheme",
  },
  "utils/liveStream.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "utils/meApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "utils/myVolunteerApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
  "utils/publicRegistrationApi.ts": {
    Bearer: "HTTP authorization scheme",
  },
};
