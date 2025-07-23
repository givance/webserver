import { StateCreator } from 'zustand';
import { SessionSlice, CampaignStore } from '../types';

export const createSessionSlice: StateCreator<CampaignStore, [], [], SessionSlice> = (set) => ({
  // Initial state
  sessionId: undefined,
  isSessionLoading: false,
  isSaving: false,
  lastSaved: null,

  // Actions
  setSessionId: (id) => set(() => ({ sessionId: id })),

  setSessionLoading: (loading) => set(() => ({ isSessionLoading: loading })),

  setSaving: (saving) => set(() => ({ isSaving: saving })),

  updateLastSaved: () => set(() => ({ lastSaved: new Date() })),

  clearSessionData: () =>
    set(() => ({
      sessionId: undefined,
      isSessionLoading: false,
      isSaving: false,
      lastSaved: null,
    })),
});
