import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeDefinition {
  name: string;
  mode: 'light' | 'dark';
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  accent: string;
  gradient: string;
  previewColors: string[];
}

export const THEMES: ThemeDefinition[] = [
  {
    name: 'Default',
    mode: 'light',
    bg: '#f0f2f5',
    surface: '#ffffff',
    surface2: '#e8eaed',
    border: 'rgba(0,0,0,0.09)',
    text: '#0f172a',
    text2: '#64748b',
    accent: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    previewColors: ['#e2e8f0', '#c8d0e0', '#a855f7'],
  },
  {
    name: 'Ocean',
    mode: 'light',
    bg: '#f0f9ff',
    surface: '#ffffff',
    surface2: '#e0f2fe',
    border: '#bae6fd',
    text: '#0c1e3a',
    text2: '#4a6d8c',
    accent: '#0284c7',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0891b2 100%)',
    previewColors: ['#dbeafe', '#e0f7fa', '#bae6fd'],
  },
  {
    name: 'Forest',
    mode: 'light',
    bg: '#f0fdf4',
    surface: '#ffffff',
    surface2: '#dcfce7',
    border: '#bbf7d0',
    text: '#052e16',
    text2: '#4a7c59',
    accent: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)',
    previewColors: ['#dcfce7', '#d1fae5', '#a7f3d0'],
  },
  {
    name: 'Sunset',
    mode: 'light',
    bg: '#fffbf0',
    surface: '#ffffff',
    surface2: '#fef3c7',
    border: '#fde68a',
    text: '#1c1009',
    text2: '#92400e',
    accent: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706 0%, #dc2626 100%)',
    previewColors: ['#fef3c7', '#fce7f3', '#fde68a'],
  },
  {
    name: 'Lavender',
    mode: 'light',
    bg: '#faf5ff',
    surface: '#ffffff',
    surface2: '#f3e8ff',
    border: '#e9d5ff',
    text: '#1e1b4b',
    text2: '#6b21a8',
    accent: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #4f46e5 100%)',
    previewColors: ['#e9d5ff', '#f3e8ff', '#8b5cf6'],
  },
  {
    name: 'Nord',
    mode: 'light',
    bg: '#eceff4',
    surface: '#ffffff',
    surface2: '#e5e9f0',
    border: '#d8dee9',
    text: '#2e3440',
    text2: '#4c566a',
    accent: '#5e81ac',
    gradient: 'linear-gradient(135deg, #81a1c1 0%, #5e81ac 100%)',
    previewColors: ['#e5e9f0', '#d8dee9', '#5e81ac'],
  },
  {
    name: 'Rose',
    mode: 'light',
    bg: '#fff1f2',
    surface: '#ffffff',
    surface2: '#ffe4e6',
    border: '#fecdd3',
    text: '#1a0010',
    text2: '#9f1239',
    accent: '#e11d48',
    gradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
    previewColors: ['#ffe4e6', '#fecdd3', '#e11d48'],
  },
  {
    name: 'Mono',
    mode: 'light',
    bg: '#f8f9fa',
    surface: '#ffffff',
    surface2: '#f1f3f5',
    border: '#dee2e6',
    text: '#212529',
    text2: '#6c757d',
    accent: '#495057',
    gradient: 'linear-gradient(135deg, #495057 0%, #212529 100%)',
    previewColors: ['#e9ecef', '#dee2e6', '#495057'],
  },
  {
    name: 'Dark',
    mode: 'dark',
    bg: '#0f172a',
    surface: '#1e293b',
    surface2: '#334155',
    border: 'rgba(168,85,247,0.18)',
    text: '#f1f5f9',
    text2: '#94a3b8',
    accent: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    previewColors: ['#1e293b', '#334155', '#a855f7'],
  },
  {
    name: 'Midnight',
    mode: 'dark',
    bg: '#020817',
    surface: '#0f172a',
    surface2: '#1e293b',
    border: 'rgba(168,85,247,0.15)',
    text: '#e2e8f0',
    text2: '#94a3b8',
    accent: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    previewColors: ['#0f172a', '#1e293b', '#a855f7'],
  },
];

interface ThemeContextValue {
  theme: ThemeDefinition;
  themeName: string;
  setThemeName: (name: string) => void;
  setThemeByName: (name: string) => void;
  // Legacy compat
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  themeName: 'Default',
  setThemeName: () => {},
  setThemeByName: () => {},
  toggleTheme: () => {},
});

function applyTheme(t: ThemeDefinition) {
  const root = document.documentElement;
  root.style.setProperty('--theme-bg', t.bg);
  root.style.setProperty('--theme-surface', t.surface);
  root.style.setProperty('--theme-surface2', t.surface2);
  root.style.setProperty('--theme-border', t.border);
  root.style.setProperty('--theme-text', t.text);
  root.style.setProperty('--theme-text2', t.text2);
  root.style.setProperty('--theme-accent', t.accent);
  root.style.setProperty('--theme-gradient', t.gradient);
  root.style.setProperty('--theme-shadow', '0 1px 4px rgba(0,0,0,0.06)');
  root.style.setProperty('--theme-shadow-hover', `0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px ${t.accent}20`);
  if (t.mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Keep the mobile-browser chrome (iOS Safari, Android Chrome) in sync with the
  // active theme so the status bar / address bar matches the surface color the
  // user actually sees. Without this, the hardcoded purple from index.html stays
  // even when the user picks Forest, Ocean, etc.
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', t.surface);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<string>(() => {
    return localStorage.getItem('applyr_theme_name') || 'Default';
  });

  const theme = THEMES.find(t => t.name === themeName) || THEMES[0];

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('applyr_theme_name', theme.name);
  }, [theme]);

  const setThemeName = (name: string) => setThemeNameState(name);

  // Legacy: toggle between Default and Dark
  const toggleTheme = () => {
    setThemeName(theme.mode === 'dark' ? 'Default' : 'Dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, setThemeName, setThemeByName: setThemeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
