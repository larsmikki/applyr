import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings as apiUpdateSettings } from '@/api';
import type { Settings } from '@/types';
import { defaultSettings, SettingsContext, settingsQueryKey } from '@/contexts/SettingsContext';

async function loadSettings(): Promise<Settings> {
  try {
    const data = await getSettings();
    return { ...defaultSettings, ...data };
  } catch {
    return defaultSettings;
  }
}

export default function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: settings = null, isLoading } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: loadSettings,
  });

  const updateMutation = useMutation({
    mutationFn: apiUpdateSettings,
    onSuccess: updated => {
      queryClient.setQueryData<Settings>(settingsQueryKey, prev => ({ ...defaultSettings, ...prev, ...updated }));
    },
  });

  const handleUpdateSettings = async (data: Partial<Settings>) => {
    await updateMutation.mutateAsync(data);
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
  };

  return (
    <SettingsContext.Provider value={{ settings, loading: isLoading, updateSettings: handleUpdateSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}
