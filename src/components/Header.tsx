import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { Button, Navbar, Container } from 'react-bootstrap';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const { t } = useTranslation();

    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow-lg bg-neutral-950 text-white z-50">
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950 to-neutral-800/20"></div>
            <Container className="d-flex justify-content-between position-relative z-10">
                {/* Logo / Title */}
                <div className="d-flex align-items-center">
                    <Navbar.Brand href="#welcome" className="d-flex align-items-center gap-2">
                        <img src={logoSrc} alt="Logo" width="36" height="36" />
                        <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 hover:from-indigo-300 hover:to-purple-400 transition-all">
                            {t("festivalName", "Champagne Festival")}
                        </span>
                    </Navbar.Brand>
                    <Button
                        variant="link"
                        className="ms-3 text-indigo-300 hover:text-indigo-200"
                        href="#welcome"
                        aria-label="Back to top"
                        title={t("navigation.home", "Home")}
                    >
                        <i className="bi bi-house"></i>
                    </Button>
                </div>

                {/* Language Switcher */}
                <div className="d-flex align-items-center">
                    <LanguageSwitcher />
                </div>
            </Container>
        </Navbar>
    );
};

export default Header;
