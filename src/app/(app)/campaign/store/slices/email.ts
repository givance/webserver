import { StateCreator } from 'zustand';
import { EmailSlice, CampaignStore } from '../types';

export const createEmailSlice: StateCreator<CampaignStore, [], [], EmailSlice> = (set) => ({
  // Initial state
  generatedEmails: [],
  sampleEmails: [],
  selectedSampleIndex: null,
  emailStatuses: {},
  referenceContexts: {},
  refinedInstruction: '',
  allGeneratedEmails: [],

  // Actions
  setGeneratedEmails: (emails) => set(() => ({ generatedEmails: emails })),

  setSampleEmails: (emails) => set(() => ({ sampleEmails: emails })),

  setSelectedSample: (index) => set(() => ({ selectedSampleIndex: index })),

  updateEmailStatus: (donorId, status) =>
    set((state) => ({
      emailStatuses: {
        ...state.emailStatuses,
        [donorId]: status,
      },
    })),

  updateEmail: (donorId, updates) =>
    set((state) => ({
      generatedEmails: state.generatedEmails.map((email) =>
        email.donorId === donorId ? { ...email, ...updates } : email
      ),
    })),

  setReferenceContexts: (contexts) => set(() => ({ referenceContexts: contexts })),

  setRefinedInstruction: (instruction) => set(() => ({ refinedInstruction: instruction })),

  setAllGeneratedEmails: (emails) => set(() => ({ allGeneratedEmails: emails })),

  clearEmailData: () =>
    set(() => ({
      generatedEmails: [],
      sampleEmails: [],
      selectedSampleIndex: null,
      emailStatuses: {},
      referenceContexts: {},
      refinedInstruction: '',
      allGeneratedEmails: [],
    })),
});
