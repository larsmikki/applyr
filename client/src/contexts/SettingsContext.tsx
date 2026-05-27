import { createContext, useContext } from 'react';
import type { Settings } from '@/types';

export interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  refresh: () => Promise<void>;
}

export const defaultSettings: Settings = {
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

export const settingsQueryKey = ['settings'] as const;

export const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  loading: true,
  updateSettings: async () => {},
  refresh: async () => {},
});

export const useSettings = () => useContext(SettingsContext);
