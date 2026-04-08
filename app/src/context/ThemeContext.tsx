import React, { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
}

export const lightTheme: Theme = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#1A1A1A',
  textSecondary: '#6B6B6B',
  primary: '#2563EB',
  border: '#E0E0E0',
};

export const darkTheme: Theme = {
  background: '#121212',
  surface: '#1E1E1E',
  text: '#F0F0F0',
  textSecondary: '#A0A0A0',
  primary: '#60A5FA',
  border: '#2E2E2E',
};

type ColorSchemeOverride = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  colorScheme: 'light' | 'dark';
  schemeOverride: ColorSchemeOverride;
  setColorScheme: (scheme: ColorSchemeOverride) => void;
  toggleColorScheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light';
  const [schemeOverride, setSchemeOverride] = useState<ColorSchemeOverride>('system');

  const colorScheme: 'light' | 'dark' =
    schemeOverride === 'system' ? systemScheme : schemeOverride;

  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  function toggleColorScheme() {
    setSchemeOverride(prev => {
      if (prev === 'system') return colorScheme === 'dark' ? 'light' : 'dark';
      return prev === 'dark' ? 'light' : 'dark';
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, schemeOverride, setColorScheme: setSchemeOverride, toggleColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
