'use client';

import Image from 'next/image';
import Link from 'next/link';
import LanguageSwitcher from './LanguageSwitcher';
import { Navbar, Container } from 'react-bootstrap';
import { Dictionary } from '@/lib/i18n';

interface HeaderProps {
    logoSrc?: string;
    lang: string;
    dictionary: Dictionary;
}

const Header = ({ logoSrc = "/images/logo.svg", lang, dictionary }: HeaderProps) => {
    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
            <Container className="d-flex justify-content-between">
                {/* Logo / Title */}
                <Navbar.Brand as={Link} href={`/${lang}`} className="d-flex align-items-center">
                    <Image
                        src={logoSrc}
                        alt="Logo"
                        width={36}
                        height={36}
                        className="me-2"
                    />
                    <span className="gradient-text">
                        {dictionary.festivalName}
                    </span>
                </Navbar.Brand>

                {/* Language Switcher */}
                <LanguageSwitcher currentLang={lang} />
            </Container>
        </Navbar>
    );
};

export default Header;