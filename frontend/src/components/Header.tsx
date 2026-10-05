import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X, ShieldCheck } from "lucide-react";
import { navigationItems } from "@/config/navigation";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

interface HeaderProps {
  logoSrc?: string;
  onBrandClick?: () => void;
}

const Header = ({ logoSrc = "/images/logo.svg", onBrandClick }: HeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header fixed z-header flex items-center riviera:site-lg:items-start">
      <div className="site-header-container mx-auto flex w-full items-center justify-between gap-4 px-3 riviera:site-lg:grid riviera:site-lg:p-0">
        <a
          href="#welcome"
          className="site-brand inline-flex items-center no-underline"
          onClick={onBrandClick}
        >
          <img
            src={logoSrc}
            alt={m.header_logo_alt()}
            width="36"
            height="36"
            className="mr-2 shrink-0"
          />
          <span className="truncate">{m.festival_name()}</span>
        </a>

        <div className="site-nav hidden site-lg:flex riviera:site-lg:grid">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href} className="site-nav-link">
              {item.getLabel()}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link to="/admin" className="icon-link gap-1.5" aria-label={m.admin_title()}>
            <ShieldCheck className="size-4" aria-hidden="true" />
          </Link>
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger
              className="icon-link site-menu-button gap-1.5 site-lg:hidden"
              aria-label={m.admin_toggle_navigation()}
            >
              <Menu aria-hidden="true" className="size-5" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-dialog bg-foreground/50" />
              <Dialog.Popup className="site-mobile-menu-panel fixed inset-x-3 top-16 z-popup text-popover-foreground">
                <Dialog.Title className="px-4 text-lg">{m.festival_name()}</Dialog.Title>
                <Dialog.Close
                  className="absolute top-4 right-4 border-0 bg-transparent text-foreground"
                  aria-label={m.close()}
                >
                  <X aria-hidden="true" />
                </Dialog.Close>
                <nav aria-label={m.admin_toggle_navigation()} className="flex flex-col gap-2">
                  {navigationItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="site-mobile-link"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.getLabel()}
                    </a>
                  ))}
                  <Link to="/admin" className="site-mobile-link" onClick={() => setMenuOpen(false)}>
                    {m.admin_title()}
                  </Link>
                </nav>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
};

export default Header;
