import { Dialog } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { Menu, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useNavigationItems } from "@/hooks/useNavigationItems";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import BrandWordmark from "./BrandWordmark";

interface MobileMenuProps {
  /** Extra classes for the trigger, e.g. to hide it from the desktop breakpoint. */
  triggerClassName?: string;
}

/**
 * Slide-in navigation sheet for narrow screens: the page sections as large tap
 * targets, with the staff-only admin entry kept out of the crowded header.
 */
const MobileMenu = ({ triggerClassName }: MobileMenuProps) => {
  const navigationItems = useNavigationItems();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn("icon-link site-menu-button gap-1.5", triggerClassName)}
        aria-label={m.admin_toggle_navigation()}
      >
        <Menu aria-hidden="true" className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-dialog bg-foreground/50 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="site-mobile-menu-panel fixed inset-y-0 right-0 z-popup m-0 flex w-full max-w-sm flex-col gap-8 overflow-y-auto rounded-none p-6 transition-transform duration-300 data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="m-0 text-base">
              <BrandWordmark />
            </Dialog.Title>
            <Dialog.Close className="icon-link text-inherit" aria-label={m.close()}>
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <nav aria-label={m.admin_toggle_navigation()} className="flex flex-col gap-1">
            {navigationItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="site-mobile-link text-xl"
                onClick={close}
              >
                {item.getLabel()}
              </a>
            ))}
          </nav>
          <Link
            to="/admin"
            className="site-mobile-link inline-flex items-center gap-2 text-sm"
            onClick={close}
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            {m.admin_title()}
          </Link>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default MobileMenu;
