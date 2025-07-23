import { StateCreator } from 'zustand';
import { CampaignSlice, CampaignStore } from '../types';

export const createCampaignSlice: StateCreator<CampaignStore, [], [], CampaignSlice> = (set) => ({
  // Initial state
  campaignName: '',
  templateId: undefined,
  templatePrompt: '',
  currentStep: 0,

  // Actions
  setCampaignName: (name) => set(() => ({ campaignName: name })),

  setTemplate: (id, prompt) =>
    set(() => ({
      templateId: id,
      templatePrompt: prompt,
    })),

  setCurrentStep: (step) => set(() => ({ currentStep: step })),

  resetCampaign: () =>
    set(() => ({
      campaignName: '',
      templateId: undefined,
      templatePrompt: '',
      currentStep: 0,
    })),
});
