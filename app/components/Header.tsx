'use client';

import Image from 'next/image';
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
                    <Image
                        src={logoSrc}
                        alt="Champagne Festival logo"
                        width={36}
                        height={36}
                        className="me-2"
                    />
                    <span className="gradient-text">
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