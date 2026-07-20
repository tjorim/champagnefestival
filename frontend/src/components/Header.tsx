import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";
import { navigationItems } from "@/config/navigation";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface HeaderProps {
  logoSrc?: string;
  onBrandClick?: () => void;
}

const Header = ({ logoSrc = "/images/logo.svg", onBrandClick }: HeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <Navbar fixed="top" variant="dark" className="site-header">
      <Container className="d-flex justify-content-between align-items-center gap-3">
        <Navbar.Brand href="#welcome" className="site-brand" onClick={onBrandClick}>
          <img src={logoSrc} alt={m.header_logo_alt()} width="36" height="36" className="me-2" />
          <span>{m.festival_name()}</span>
        </Navbar.Brand>

        <div className="site-nav d-none d-lg-flex align-items-center gap-2">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href} className="site-nav-link">
              {item.getLabel()}
            </a>
          ))}
        </div>

        <div className="d-flex align-items-center gap-2">
          <LanguageSwitcher />
          <Link to="/admin" className="icon-link" aria-label={m.admin_title()}>
            <i className="bi bi-shield-lock" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="icon-link site-menu-button d-lg-none"
            aria-label={m.admin_toggle_navigation()}
            aria-expanded={menuOpen}
            aria-controls="mobile-site-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className={menuOpen ? "bi bi-x-lg" : "bi bi-list"} aria-hidden="true" />
          </button>
        </div>
      </Container>

      <div
        id="mobile-site-menu"
        className={`site-mobile-menu d-lg-none ${menuOpen ? "is-open" : ""}`}
      >
        <div className="container">
          <nav className="site-mobile-menu-panel" aria-label="Mobile">
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
              <i className="bi bi-shield-lock me-2" aria-hidden="true" />
              {m.admin_title()}
            </Link>
          </nav>
        </div>
      </div>
    </Navbar>
  );
};

export default Header;
