import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import { ShieldCheck } from "lucide-react";
import { useNavigationItems } from "@/hooks/useNavigationItems";
import { Link } from "@tanstack/react-router";
import BrandWordmark from "./BrandWordmark";
import MobileMenu from "./MobileMenu";

interface HeaderProps {
  onBrandClick?: () => void;
}

const Header = ({ onBrandClick }: HeaderProps) => {
  const navigationItems = useNavigationItems();
  return (
    <header className="site-header fixed z-header flex items-center riviera:site-lg:items-start">
      <div className="site-header-container mx-auto flex w-full items-center justify-between gap-4 px-3 riviera:site-lg:grid riviera:site-lg:p-0">
        <a
          href="#welcome"
          className="site-brand inline-flex items-center no-underline"
          onClick={onBrandClick}
        >
          <BrandWordmark />
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
          <Link
            to="/admin"
            className="icon-link hidden gap-1.5 site-lg:inline-flex"
            aria-label={m.admin_title()}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
          </Link>
          <MobileMenu triggerClassName="site-lg:hidden" />
        </div>
      </div>
    </header>
  );
};

export default Header;
