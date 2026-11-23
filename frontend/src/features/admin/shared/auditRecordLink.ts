const recordSections: Readonly<Record<string, string>> = {
  announcement: "announcements",
  edition: "editions",
  email_category: "email-categories",
  event_category: "event-categories",
  faq_item: "faq",
  product_category: "product-categories",
  event: "editions",
  organization: "organizations",
  registration: "registrations",
  room: "venues",
  table_type: "venues",
  venue: "venues",
};

export function auditRecordId(type: string, id: string | number) {
  return `audit-${type}-${encodeURIComponent(id)}`;
}

export function auditRecordHref(type: string, id: string) {
  if (type === "signage_channels") {
    return `${import.meta.env.BASE_URL}admin?section=signage-channels&signageChannel=${encodeURIComponent(id)}`;
  }
  const section = Object.hasOwn(recordSections, type) ? recordSections[type] : undefined;
  return section
    ? `${import.meta.env.BASE_URL}admin?section=${section}#${auditRecordId(type, id)}`
    : undefined;
}

export function isAuditRecordTarget(type: string, id: string | number) {
  return window.location.hash.slice(1) === auditRecordId(type, id);
}

export function focusAuditRecord(node: HTMLElement | null) {
  if (node?.id && window.location.hash.slice(1) === node.id) {
    node.scrollIntoView?.({ block: "center" });
    node.focus({ preventScroll: true });
  }
}

export function readAuditRegistrationTarget() {
  const prefix = "#audit-registration-";
  const hash = window.location.hash;
  if (!hash.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(hash.slice(prefix.length));
  } catch {
    return "";
  }
}
