// ThemeToggle.tsx
import * as Switch from "@radix-ui/react-switch";
import React, { useState, useEffect } from "react";

const ThemeToggle = () => {
    const [checked, setChecked] = useState(true); // true means dark mode is active

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", checked ? "dark" : "light");
    }, [checked]);

    return (
        <div className="theme-toggle-container">
            <label htmlFor="theme-switch" className="theme-label">
                Dark Mode
            </label>
            <Switch.Root
                id="theme-switch"
                checked={checked}
                onCheckedChange={setChecked}
                className="switch-root"
            >
                <Switch.Thumb className="switch-thumb" />
            </Switch.Root>
        </div>
    );
};

export default ThemeToggle;
