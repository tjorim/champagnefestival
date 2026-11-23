import { lazy, type ComponentType } from "react";
import {
  BuildingIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChartColumnIcon,
  CircleQuestionMarkIcon,
  Grid3x3Icon,
  HourglassIcon,
  LayersIcon,
  MailCheckIcon,
  MailIcon,
  MegaphoneIcon,
  NotebookTextIcon,
  PackageIcon,
  PhoneIcon,
  RotateCcwClockIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  TagsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { m } from "@/paraglide/messages";
import { useAdminWorkspace } from "./AdminWorkspace";
import { HomeSection, RegistrationsSection } from "./AdminRegistrationSection";
// Keep secondary tools out of the initial registrations download.
const LayoutEditor = lazy(() => import("../venue/LayoutEditor"));
const VenueManagement = lazy(() => import("../venue/VenueManagement"));
const CategoryManagement = lazy(() => import("../content/CategoryManagement"));
const EmailCategoryManagement = lazy(() => import("../content/EmailCategoryManagement"));
const FaqManagement = lazy(() => import("../content/FaqManagement"));
const AnnouncementsSection = lazy(() => import("../content/AnnouncementsSection"));
const SignageSection = lazy(() => import("@/features/signage/SignageSection"));
const PolicyManagement = lazy(() => import("../content/PolicyManagement"));
const SettingsManagement = lazy(() => import("../content/SettingsManagement"));
const ContactMessagesManagement = lazy(() => import("../content/ContactMessagesManagement"));
const ScratchpadManagement = lazy(() => import("../content/ScratchpadManagement"));
const WaitlistManagement = lazy(() => import("../registrations/WaitlistManagement"));
const AnalyticsDashboard = lazy(() => import("../insights/AnalyticsDashboard"));
const AuditLogViewer = lazy(() => import("../insights/AuditLogViewer"));
const PushOptIn = lazy(() => import("@/components/PushOptIn"));

const EditionsPane = lazy(() =>
  import("./AdminContentSections").then((module) => ({ default: module.EditionsPane })),
);
const OrganizationsSection = lazy(() =>
  import("./AdminContentSections").then((module) => ({ default: module.OrganizationsSection })),
);
const PeoplePane = lazy(() => import("./AdminPeopleSection"));

function ScratchpadSection() {
  const { activeEdition } = useAdminWorkspace();
  return <ScratchpadManagement editionId={activeEdition.id} />;
}

function EventCategories() {
  return <CategoryManagement kind="event" />;
}

function ProductCategories() {
  return <CategoryManagement kind="product" />;
}

function ContactDetails() {
  return <SettingsManagement section="contact" />;
}

function SettingsPane() {
  return (
    <div className="flex flex-col gap-4">
      <SettingsManagement section="maintenance" />
      <PushOptIn admin />
    </div>
  );
}

export type AdminSectionGroup = "events" | "content" | "venue" | "system";
interface AdminSectionDefinition {
  component: ComponentType;
  icon: LucideIcon;
  label: () => string;
  group?: AdminSectionGroup;
  activeEdition?: boolean;
  staff?: boolean;
}

/** Insertion order is sidebar order. Each group's sections are contiguous. */
const sections = {
  home: { component: HomeSection, icon: NotebookTextIcon, label: m.workspace_title, staff: true },
  registrations: {
    component: RegistrationsSection,
    icon: CalendarCheckIcon,
    label: m.admin_registrations_tab,
    activeEdition: true,
    staff: true,
  },
  waitlist: {
    component: WaitlistManagement,
    icon: HourglassIcon,
    label: m.admin_waitlist_section,
    activeEdition: true,
  },
  "contact-messages": {
    component: ContactMessagesManagement,
    icon: MailIcon,
    label: m.admin_contact_messages_section,
  },
  scratchpad: {
    component: ScratchpadSection,
    icon: NotebookTextIcon,
    label: m.admin_scratchpad_section,
    activeEdition: true,
  },
  editions: {
    component: EditionsPane,
    icon: CalendarIcon,
    label: m.admin_content_editions_section,
    group: "events",
    activeEdition: true,
  },
  organizations: {
    component: OrganizationsSection,
    icon: StoreIcon,
    label: m.admin_content_organizations_section,
    group: "events",
  },
  "event-categories": {
    component: EventCategories,
    icon: TagsIcon,
    label: m.admin_event_categories_section,
    group: "events",
  },
  "product-categories": {
    component: ProductCategories,
    icon: PackageIcon,
    label: m.admin_product_categories_section,
    group: "events",
  },
  faq: {
    component: FaqManagement,
    icon: CircleQuestionMarkIcon,
    label: m.admin_content_faq_section,
    group: "content",
  },
  "email-categories": {
    component: EmailCategoryManagement,
    icon: MailCheckIcon,
    label: m.admin_email_categories_section,
    group: "content",
  },
  "signage-channels": {
    component: SignageSection,
    icon: LayersIcon,
    label: m.signage_channels_heading,
    group: "content",
  },
  announcements: {
    component: AnnouncementsSection,
    icon: MegaphoneIcon,
    label: m.admin_announcements_section,
    group: "content",
  },
  policies: {
    component: PolicyManagement,
    icon: ShieldIcon,
    label: m.admin_policies_section,
    group: "content",
  },
  "contact-details": {
    component: ContactDetails,
    icon: PhoneIcon,
    label: m.admin_contact_details_section,
    group: "content",
  },
  venues: {
    component: VenueManagement,
    icon: BuildingIcon,
    label: m.admin_venues_rooms_tab,
    group: "venue",
  },
  "floor-plans": {
    component: LayoutEditor,
    icon: Grid3x3Icon,
    label: m.admin_floor_plans_tab,
    group: "venue",
    activeEdition: true,
  },
  people: { component: PeoplePane, icon: UsersIcon, label: m.admin_people_tab },
  analytics: {
    component: AnalyticsDashboard,
    icon: ChartColumnIcon,
    label: m.admin_analytics_tab,
    activeEdition: true,
  },
  settings: {
    component: SettingsPane,
    icon: SlidersHorizontalIcon,
    label: m.admin_content_settings_section,
    group: "system",
  },
  "audit-log": {
    component: AuditLogViewer,
    icon: RotateCcwClockIcon,
    label: m.admin_audit_log_tab,
    group: "system",
  },
} satisfies Record<string, AdminSectionDefinition>;

export type AdminSectionKey = keyof typeof sections;
export const adminSections: Record<AdminSectionKey, AdminSectionDefinition> = sections;
export const adminSectionKeys = Object.keys(adminSections) as AdminSectionKey[];

export function getAdminSection(key: string): AdminSectionDefinition {
  return adminSections[key as AdminSectionKey] ?? adminSections.home;
}
