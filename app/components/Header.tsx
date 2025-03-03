'use client';

import Image from 'next/image';
import Link from 'next/link';
import LanguageSwitcher from './LanguageSwitcher';
import { Navbar, Container } from 'react-bootstrap';
import { getDictionary } from '@/lib/i18n';

interface HeaderProps {
    logoSrc?: string;
    lang: string;
}

const Header = ({ logoSrc = "/images/logo.svg", lang }: HeaderProps) => {
    // We'll use local dictionary lookup for client components
    // This is called client dictionary pattern
    const dictionary = async () => {
        const dict = await getDictionary(lang);
        return dict;
    };

    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
            <Container className="d-flex justify-content-between">
                {/* Logo / Title */}
                <Navbar.Brand href={`/${lang}#welcome`} className="d-flex align-items-center">
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