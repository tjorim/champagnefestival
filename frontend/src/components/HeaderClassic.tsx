import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import { ShieldCheck } from "lucide-react";

import { useNavigationItems } from "@/hooks/useNavigationItems";
import { Link } from "@tanstack/react-router";
import BrandWordmark from "./BrandWordmark";
import MobileMenu from "./MobileMenu";

/** Pre-refresh header design, kept for the classic/new preview switcher. */
const HeaderClassic = () => {
  const navigationItems = useNavigationItems();
  return (
    <nav className="fixed inset-x-0 top-0 z-1030 bg-muted text-foreground shadow py-2">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3">
        <a href="#welcome" className="flex items-center text-base no-underline">
          <BrandWordmark />
        </a>

        <div className="hidden items-center gap-3 lg:flex">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-foreground no-underline">
              {item.getLabel()}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            to="/admin"
            className="hidden text-foreground lg:inline"
            aria-label={m.admin_title()}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
          </Link>
          <MobileMenu triggerClassName="lg:hidden" />
        </div>
      </div>
    </nav>
  );
};

export default HeaderClassic;
