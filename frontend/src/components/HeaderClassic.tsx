import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import { ShieldCheck } from "lucide-react";

import { navigationItems } from "@/config/navigation";
import { Link } from "@tanstack/react-router";

interface HeaderClassicProps {
  logoSrc?: string;
}

/** Pre-refresh header design, kept for the classic/new preview switcher. */
const HeaderClassic = ({ logoSrc = "/images/logo.svg" }: HeaderClassicProps) => {
  return (
    <nav className="fixed inset-x-0 top-0 z-1030 bg-muted text-foreground shadow py-2">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3">
        <a href="#welcome" className="flex items-center text-xl font-medium no-underline">
          <img src={logoSrc} alt={m.header_logo_alt()} width="36" height="36" className="mr-2" />
          <span className="bg-linear-to-br from-primary to-secondary bg-clip-text text-transparent">
            {m.festival_name()}
          </span>
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
          <Link to="/admin" className="text-foreground" aria-label={m.admin_title()}>
            <ShieldCheck className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default HeaderClassic;
