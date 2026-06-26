import { create } from 'zustand';
import type { AppSettings } from '../lib/config';
import { DEFAULT_SETTINGS } from '../lib/config';

interface StoreState {
  settings: AppSettings;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoading: true,

  loadSettings: async () => {
    set({ isLoading: true });
    const result = await chrome.storage.local.get('appSettings');
    const settings = { ...DEFAULT_SETTINGS, ...(result.appSettings as Partial<AppSettings>) };
    set({ settings, isLoading: false });
  },

  saveSettings: async (patch: Partial<AppSettings>) => {
    const current = get().settings;
    const updated = { ...current, ...patch };
    await chrome.storage.local.set({ appSettings: updated });
    set({ settings: updated });
  },
}));
