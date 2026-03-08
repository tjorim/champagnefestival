import { m } from "../paraglide/messages";
import LanguageSwitcher from "./LanguageSwitcher";
import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";

interface HeaderProps {
  logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
  return (
    <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
      <Container className="d-flex justify-content-between">
        {/* Logo / Title */}
        <Navbar.Brand href="#welcome" className="d-flex align-items-center">
          <img
            src={logoSrc}
            alt={m.header_logo_alt()}
            width="36"
            height="36"
            className="me-2"
          />
          <span className="gradient-text">{m.festival_name()}</span>
        </Navbar.Brand>

        {/* Language Switcher */}
        <LanguageSwitcher />
      </Container>
    </Navbar>
  );
};

export default Header;
