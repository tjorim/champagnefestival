'use client';

import Image from 'next/image';
import Link from 'next/link';
import LanguageSwitcher from './LanguageSwitcher';
import { Navbar, Container } from 'react-bootstrap';

interface HeaderProps {
    logoSrc?: string;
    lang: string;
}

const Header = ({ logoSrc = "/images/logo.svg", lang }: HeaderProps) => {
    // Dictionary lookup removed as it's not currently used

    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
            <Container className="d-flex justify-content-between">
                {/* Logo / Title */}
                <Navbar.Brand as={Link} href={`/${lang}`} className="d-flex align-items-center">
                    <Image
                        src={logoSrc}
                        alt="Champagne Festival logo"
                        width={36}
                        height={36}
                        className="me-2"
                    />
                    <span className="gradient-text">
                        Champagne Festival
                    </span>
                </Navbar.Brand>

                {/* Language Switcher */}
                <LanguageSwitcher currentLang={lang} />
            </Container>
        </Navbar>
    );
};

export default Header;