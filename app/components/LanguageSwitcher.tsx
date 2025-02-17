// LanguageSwitcher.tsx
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import React from "react";
import { useTranslation } from "react-i18next";

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const handleValueChange = (value: string) => {
        if (value) {
            i18n.changeLanguage(value);
        }
    };

    return (
        <ToggleGroup.Root
            type="single"
            value={i18n.language}
            onValueChange={handleValueChange}
            className="toggle-group"
        >
            <ToggleGroup.Item value="en" className="toggle-item">
                English
            </ToggleGroup.Item>
            <ToggleGroup.Item value="nl" className="toggle-item">
                Nederlands
            </ToggleGroup.Item>
            <ToggleGroup.Item value="fr" className="toggle-item">
                Français
            </ToggleGroup.Item>
        </ToggleGroup.Root>
    );
};

export default LanguageSwitcher;
