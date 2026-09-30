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
    <header
      data-tailwind-migrated="true"
      className="site-header tw:fixed tw:z-header tw:flex tw:items-center tw:riviera:site-lg:items-start"
    >
      <div className="site-header-container tw:mx-auto tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-4 tw:px-3 tw:riviera:site-lg:grid tw:riviera:site-lg:p-0">
        <a
          href="#welcome"
          className="site-brand tw:inline-flex tw:items-center tw:no-underline"
          onClick={onBrandClick}
        >
          <img
            src={logoSrc}
            alt={m.header_logo_alt()}
            width="36"
            height="36"
            className="tw:mr-2 tw:shrink-0"
          />
          <span className="tw:truncate">{m.festival_name()}</span>
        </a>

        <div className="site-nav tw:hidden tw:site-lg:flex tw:riviera:site-lg:grid">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href} className="site-nav-link">
              {item.getLabel()}
            </a>
          ))}
        </div>

        <div className="tw:flex tw:items-center tw:gap-2">
          <LanguageSwitcher />
          <Link to="/admin" className="icon-link" aria-label={m.admin_title()}>
            <ShieldCheck className="tw:size-4" aria-hidden="true" />
          </Link>
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger
              className="icon-link site-menu-button tw:site-lg:hidden"
              aria-label={m.admin_toggle_navigation()}
            >
              <Menu aria-hidden="true" className="tw:size-5" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="tw:fixed tw:inset-0 tw:z-dialog tw:bg-foreground/50" />
              <Dialog.Popup className="site-mobile-menu-panel tw:fixed tw:inset-x-3 tw:top-16 tw:z-popup tw:text-popover-foreground">
                <Dialog.Title className="tw:px-4 tw:text-lg">{m.festival_name()}</Dialog.Title>
                <Dialog.Close
                  className="tw:absolute tw:top-4 tw:right-4 tw:border-0 tw:bg-transparent tw:text-foreground"
                  aria-label={m.close()}
                >
                  <X aria-hidden="true" />
                </Dialog.Close>
                <nav
                  aria-label={m.admin_toggle_navigation()}
                  className="tw:flex tw:flex-col tw:gap-2"
                >
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
