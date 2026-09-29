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
    <nav
      data-tailwind-migrated="true"
      className="tw:fixed tw:inset-x-0 tw:top-0 tw:z-1030 tw:bg-muted tw:text-foreground tw:shadow tw:py-2"
    >
      <div className="tw:mx-auto tw:flex tw:max-w-7xl tw:items-center tw:justify-between tw:gap-3 tw:px-3">
        <a
          href="#welcome"
          className="tw:flex tw:items-center tw:text-xl tw:font-medium tw:no-underline"
        >
          <img src={logoSrc} alt={m.header_logo_alt()} width="36" height="36" className="tw:mr-2" />
          <span className="tw:bg-linear-to-br tw:from-primary tw:to-secondary tw:bg-clip-text tw:text-transparent">
            {m.festival_name()}
          </span>
        </a>

        <div className="tw:hidden tw:items-center tw:gap-3 tw:lg:flex">
          {navigationItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="tw:text-sm tw:text-foreground tw:no-underline"
            >
              {item.getLabel()}
            </a>
          ))}
        </div>

        <div className="tw:flex tw:items-center tw:gap-3">
          <LanguageSwitcher />
          <Link to="/admin" className="tw:text-foreground" aria-label={m.admin_title()}>
            <ShieldCheck className="tw:size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default HeaderClassic;
