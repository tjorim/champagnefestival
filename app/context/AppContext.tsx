import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Theme type
type ThemeType = 'light' | 'dark';

// Context interface
interface AppContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
}

// Create context with default values
const AppContext = createContext<AppContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {}
});

/**
 * App context provider component
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeType>('dark');
  const { i18n } = useTranslation();

  // Toggle between light and dark theme
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      
      // Update document for theme-specific styling
      document.documentElement.setAttribute('data-theme', newTheme);
      
      return newTheme;
    });
  }, []);

  // Initialize theme on mount
  useState(() => {
    // Set initial theme attribute
    document.documentElement.setAttribute('data-theme', theme);
  });

  const contextValue = {
    theme,
    setTheme,
    toggleTheme
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to use the app context
 */
export function useApp() {
  const context = useContext(AppContext);
  
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  
  return context;
}