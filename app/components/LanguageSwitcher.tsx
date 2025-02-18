// LanguageSwitcher.tsx
import React from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();
    const currentLang = i18n.language;

    return (
        <ToggleGroup.Root
            type="single"
            value={currentLang}
            onValueChange={(value) => i18n.changeLanguage(value)}
            className="flex space-x-1"
        >
            <ToggleGroup.Item
                value="en"
                className={`px-2 py-1 border rounded ${currentLang === 'en' ? 'bg-indigo-700' : 'bg-transparent'
                    }`}
            >
                EN
            </ToggleGroup.Item>
            <ToggleGroup.Item
                value="nl"
                className={`px-2 py-1 border rounded ${currentLang === 'nl' ? 'bg-indigo-700' : 'bg-transparent'
                    }`}
            >
                NL
            </ToggleGroup.Item>
            <ToggleGroup.Item
                value="fr"
                className={`px-2 py-1 border rounded ${currentLang === 'fr' ? 'bg-indigo-700' : 'bg-transparent'
                    }`}
            >
                FR
            </ToggleGroup.Item>
        </ToggleGroup.Root>
    );
};

export default LanguageSwitcher;
