import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { Navbar, Container } from 'react-bootstrap';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const { t } = useTranslation();

    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
            <Container className="d-flex justify-content-between">
                {/* Logo / Title */}
                <Navbar.Brand href="#welcome" className="d-flex align-items-center">
                    <img 
                        src={logoSrc} 
                        alt="Logo" 
                        width="36" 
                        height="36" 
                        className="me-2"
                    />
                    <span 
                        style={{ 
                            background: "linear-gradient(135deg, #6e8efb, #a16efa)",
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                            fontWeight: "bold",
                            fontSize: "1.25rem"
                        }}
                    >
                        {t("festivalName", "Champagne Festival")}
                    </span>
                </Navbar.Brand>

                {/* Language Switcher */}
                <LanguageSwitcher />
            </Container>
        </Navbar>
    );
};

export default Header;
