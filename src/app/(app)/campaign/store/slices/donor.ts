import { StateCreator } from 'zustand';
import { DonorSlice, CampaignStore } from '../types';

export const createDonorSlice: StateCreator<CampaignStore, [], [], DonorSlice> = (set) => ({
  // Initial state
  selectedDonors: [],
  donorData: {},
  totalRemainingDonors: 0,
  canGenerateMore: false,

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

  setTotalRemainingDonors: (count) => set(() => ({ totalRemainingDonors: count })),

  setCanGenerateMore: (canGenerate) => set(() => ({ canGenerateMore: canGenerate })),

  clearDonorData: () =>
    set(() => ({
      selectedDonors: [],
      donorData: {},
      totalRemainingDonors: 0,
      canGenerateMore: false,
    })),
});
