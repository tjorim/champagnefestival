import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { LogoImage } from "@/components/LogoImage";
import { ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SliderItem } from "@/config/editions";
import { m } from "@/paraglide/messages";
import { organizationDescription } from "@/utils/organizationDescription";
import { formatStandDay, type Stand } from "@/utils/standsApi";

interface OrganizationDetailModalProps {
  /** The organization to show, or `null` while the dialog is closed. */
  item: SliderItem | null;
  stands?: Stand[];
  locale: string;
  onClose: () => void;
}

/** Only plain web links are offered; anything else in the stored website is ignored. */
function safeWebsite(website: string | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Visitor-facing details of one organization from the logo walls: logo, the full
 * description, website and every stand day by day.
 */
export default function OrganizationDetailModal({
  item,
  stands = [],
  locale,
  onClose,
}: OrganizationDetailModalProps) {
  const description = item ? organizationDescription(item, locale) : null;
  const website = safeWebsite(item?.website);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="default">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>{item.name}</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <div
                data-slot="organization-logo"
                className="flex h-40 items-center justify-center overflow-hidden rounded-md bg-white p-3"
              >
                <LogoImage item={item} className="size-full object-contain" />
              </div>
              {description && (
                <DialogDescription className="m-0 text-sm whitespace-pre-line text-foreground">
                  {description}
                </DialogDescription>
              )}
              {stands.length > 0 && (
                <section data-slot="organization-stands" className="flex flex-col gap-1.5">
                  <h3 className="m-0 flex items-center gap-1.5 text-sm font-semibold">
                    <Icon icon={MapPinIcon} className="text-primary" />
                    {m.organization_modal_stands()}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {stands.map((stand) => (
                      <li key={`${stand.event_id}|${stand.room_name}|${stand.label}`}>
                        <span className="font-medium">
                          {formatStandDay(stand.date, locale, "long")}
                        </span>
                        {": "}
                        {stand.room_name ? `${stand.label} · ${stand.room_name}` : stand.label}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </DialogBody>
            {website && (
              <DialogFooter>
                <ButtonLink
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                >
                  {m.organization_modal_website()}
                  <Icon icon={ExternalLinkIcon} />
                </ButtonLink>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
