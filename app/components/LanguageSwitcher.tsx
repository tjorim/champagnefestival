import React from "react";
import { useTranslation } from "react-i18next";

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const handleChangeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    return (
        <div className="language-switcher flex gap-2">
            <button
                onClick={() => handleChangeLanguage('en')}
                className="p-2 border rounded"
            >
                English
            </button>
            <button
                onClick={() => handleChangeLanguage('nl')}
                className="p-2 border rounded"
            >
                Nederlands
            </button>
            <button
                onClick={() => handleChangeLanguage('fr')}
                className="p-2 border rounded"
            >
                Français
            </button>
        </div>
    );
};

export default LanguageSwitcher;
