import { StateCreator } from 'zustand';
import { EmailSlice, CampaignStore } from '../types';

export const createEmailSlice: StateCreator<CampaignStore, [], [], EmailSlice> = (set, get) => ({
  // Initial state
  generatedEmails: [],
  sampleEmails: [],
  selectedSampleIndex: null,
  emailStatuses: {},
  referenceContexts: {},
  refinedInstruction: '',
  allGeneratedEmails: [],

  // Computed properties
  get approvedCount() {
    try {
      const state = get();
      const emailStatuses = state?.emailStatuses;
      if (!emailStatuses) return 0;
      return Object.values(emailStatuses).filter((status) => status === 'APPROVED').length;
    } catch {
      return 0;
    }
  },

  get pendingCount() {
    try {
      const state = get();
      const emailStatuses = state?.emailStatuses;
      if (!emailStatuses) return 0;
      return Object.values(emailStatuses).filter((status) => status === 'PENDING_APPROVAL').length;
    } catch {
      return 0;
    }
  },

  // Actions
  setGeneratedEmails: (emails) => {
    console.log('🔧 Zustand setGeneratedEmails called with:', {
      emailCount: emails.length,
      emails,
    });
    return set(() => ({ generatedEmails: emails }));
  },

  setSampleEmails: (emails) => set(() => ({ sampleEmails: emails })),

  setSelectedSample: (index) => set(() => ({ selectedSampleIndex: index })),

  updateEmailStatus: (donorId, status) =>
    set((state) => ({
      emailStatuses: {
        ...state.emailStatuses,
        [donorId]: status,
      },
    })),

  setEmailStatuses: (statuses) =>
    set((state) => ({
      emailStatuses: typeof statuses === 'function' ? statuses(state.emailStatuses) : statuses,
    })),

  updateEmail: (donorId, updates) =>
    set((state) => ({
      generatedEmails: state.generatedEmails.map((email) =>
        email.donorId === donorId ? { ...email, ...updates } : email
      ),
    })),

  setReferenceContexts: (contexts) => set(() => ({ referenceContexts: contexts })),

  setRefinedInstruction: (instruction) => set(() => ({ refinedInstruction: instruction })),

  setAllGeneratedEmails: (emails) => {
    console.log('🔧 Zustand setAllGeneratedEmails called with:', {
      emailCount: emails.length,
      emails,
    });
    return set(() => ({ allGeneratedEmails: emails }));
  },

  clearEmailData: () => {
    console.log('🧹 Zustand clearEmailData called - clearing all email data');
    return set(() => ({
      generatedEmails: [],
      sampleEmails: [],
      selectedSampleIndex: null,
      emailStatuses: {},
      referenceContexts: {},
      refinedInstruction: '',
      allGeneratedEmails: [],
    }));
  },
});
