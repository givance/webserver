import { StateCreator } from 'zustand';
import { UISlice, CampaignStore } from '../types';

export const createUISlice: StateCreator<CampaignStore, [], [], UISlice> = (set) => ({
  // Initial state
  isGenerating: false,
  isGeneratingMore: false,
  isRegenerating: false,
  isScheduling: false,
  showScheduleConfig: false,
  showBulkGenerationDialog: false,
  showRegenerateDialog: false,
  isChatCollapsed: false,
  isEmailListExpanded: false,
  validationResult: null,
  error: null,
  streamingStatus: 'idle',
  isUpdatingStatus: false,
  isStartingBulkGeneration: false,
  regenerateOption: 'all',

  // Actions
  setGenerating: (generating) => set(() => ({ isGenerating: generating })),

  setGeneratingMore: (generating) => set(() => ({ isGeneratingMore: generating })),

  setRegenerating: (regenerating) => set(() => ({ isRegenerating: regenerating })),

  setScheduling: (scheduling) => set(() => ({ isScheduling: scheduling })),

  toggleScheduleConfig: () =>
    set((state) => ({
      showScheduleConfig: !state.showScheduleConfig,
    })),

  setBulkGenerationDialog: (show) =>
    set(() => ({
      showBulkGenerationDialog: show,
    })),

  setRegenerateDialog: (show) =>
    set(() => ({
      showRegenerateDialog: show,
    })),

  toggleChat: () =>
    set((state) => ({
      isChatCollapsed: !state.isChatCollapsed,
    })),

  toggleEmailList: () =>
    set((state) => ({
      isEmailListExpanded: !state.isEmailListExpanded,
    })),

  setIsChatCollapsed: (collapsed) => set(() => ({ isChatCollapsed: collapsed })),

  setIsEmailListExpanded: (expanded) => set(() => ({ isEmailListExpanded: expanded })),

  setValidationResult: (result) => set(() => ({ validationResult: result })),

  setError: (error) => set(() => ({ error })),

  setStreamingStatus: (status) => set(() => ({ streamingStatus: status })),

  setUpdatingStatus: (updating) => set(() => ({ isUpdatingStatus: updating })),

  setStartingBulkGeneration: (starting) => set(() => ({ isStartingBulkGeneration: starting })),

  setRegenerateOption: (option) => set(() => ({ regenerateOption: option })),

  resetUIState: () =>
    set(() => ({
      isGenerating: false,
      isGeneratingMore: false,
      isRegenerating: false,
      isScheduling: false,
      showScheduleConfig: false,
      showBulkGenerationDialog: false,
      showRegenerateDialog: false,
      isChatCollapsed: false,
      isEmailListExpanded: false,
      validationResult: null,
      error: null,
      streamingStatus: 'idle',
      isUpdatingStatus: false,
      isStartingBulkGeneration: false,
      regenerateOption: 'all',
    })),
});
