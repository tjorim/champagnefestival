'use client';

import Image from 'next/image';
import Link from 'next/link';
import LanguageSwitcher from './LanguageSwitcher';
import { Navbar, Container } from 'react-bootstrap';
import { useTranslations, useLocale } from 'next-intl';

interface HeaderProps {
    logoSrc?: string;
}

const Header = ({ logoSrc = "/images/logo.svg" }: HeaderProps) => {
    const t = useTranslations();
    const locale = useLocale();
    
    return (
        <Navbar fixed="top" bg="dark" variant="dark" className="shadow">
            <Container className="d-flex justify-content-between">
                {/* Logo / Title */}
                <Navbar.Brand as={Link} href={`/${locale}`} className="d-flex align-items-center">
                    <Image
                        src={logoSrc}
                        alt={`${t('festivalName')} Logo`}
                        width={36}
                        height={36}
                        className="me-2"
                        priority
                        sizes="36px"
                    />
                    <span className="gradient-text">
                        {t('festivalName', { defaultValue: 'Champagne Festival' })}
                    </span>
                </Navbar.Brand>

                {/* Language Switcher */}
                <LanguageSwitcher />
            </Container>
        </Navbar>
    );
};

export default Header;