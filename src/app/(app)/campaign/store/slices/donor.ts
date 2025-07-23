import { StateCreator } from 'zustand';
import { DonorSlice, CampaignStore } from '../types';

export const createDonorSlice: StateCreator<CampaignStore, [], [], DonorSlice> = (set) => ({
  // Initial state
  selectedDonors: [],
  donorData: {},

  // Actions
  setSelectedDonors: (donors) => set(() => ({ selectedDonors: donors })),

  addDonor: (donorId) =>
    set((state) => ({
      selectedDonors: state.selectedDonors.includes(donorId)
        ? state.selectedDonors
        : [...state.selectedDonors, donorId],
    })),

  removeDonor: (donorId) =>
    set((state) => ({
      selectedDonors: state.selectedDonors.filter((id) => id !== donorId),
    })),

  cacheDonorData: (donors) =>
    set((state) => {
      const newDonorData = { ...state.donorData };
      donors.forEach((donor) => {
        newDonorData[donor.id] = donor;
      });
      return { donorData: newDonorData };
    }),

  clearDonorData: () =>
    set(() => ({
      selectedDonors: [],
      donorData: {},
    })),
});
