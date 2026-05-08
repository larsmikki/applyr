import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSettings, updateSettings } from '@/api';
import type { Settings } from '@/types';

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  loading: true,
  updateSettings: async () => {},
  refresh: async () => {},
});

const defaultSettings: Settings = {
  ai_provider: 'openai',
  ai_model: 'gpt-4o',
  ai_api_key: '',
  ai_base_url: '',
  tone: 'professional',
  length: 'standard',
  structure: 'standard',
  output_dir: '',
  pin_enabled: '0',
  theme: 'light',
  output_language: 'en',
};

export default function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const data = await getSettings();
      setSettings({ ...defaultSettings, ...data });
    } catch {
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdateSettings = async (data: Partial<Settings>) => {
    const updated = await updateSettings(data);
    setSettings(prev => ({ ...defaultSettings, ...prev, ...updated }));
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings: handleUpdateSettings, refresh: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
