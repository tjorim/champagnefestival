import { m } from "@/paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";
import { navigationItems } from "@/config/navigation";

interface HeaderProps {
  logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
  return (
    <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
      <Container className="d-flex justify-content-between align-items-center gap-3">
        <Navbar.Brand href="#welcome" className="d-flex align-items-center">
          <img src={logoSrc} alt={m.header_logo_alt()} width="36" height="36" className="me-2" />
          <span className="gradient-text">{m.festival_name()}</span>
        </Navbar.Brand>

        <div className="d-none d-lg-flex align-items-center gap-3">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href} className="small text-decoration-none text-light">
              {item.label}
            </a>
          ))}
        </div>

        <LanguageSwitcher />
      </Container>
    </Navbar>
  );
};

export default Header;
