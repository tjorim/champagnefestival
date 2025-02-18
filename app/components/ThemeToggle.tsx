// ThemeToggle.tsx
import React, { useState, useEffect } from 'react';
import * as Switch from '@radix-ui/react-switch';

const ThemeToggle = () => {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        // Update the data-theme attribute on the root element for your Radix theme (if applicable)
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }, [isDark]);

    return (
        <div className="flex items-center space-x-2">
            <span className="text-sm">Dark</span>
            <Switch.Root
                className="w-10 h-6 bg-gray-300 rounded-full relative"
                checked={isDark}
                onCheckedChange={(checked) => setIsDark(checked)}
            >
                <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 translate-x-0" />
            </Switch.Root>
        </div>
    );
};

export default ThemeToggle;
