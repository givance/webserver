import { StateCreator } from 'zustand';
import { ChatSlice, CampaignStore } from '../types';

export const createChatSlice: StateCreator<CampaignStore, [], [], ChatSlice> = (set) => ({
  // Initial state
  chatMessages: [],
  instruction: '',
  suggestedMemories: [],
  isAgenticFlow: false,
  agenticSessionId: null,

  // Actions
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...message,
          timestamp: message.timestamp || new Date(),
        },
      ],
    })),

  setChatMessages: (messages) =>
    set((state) => ({
      chatMessages: typeof messages === 'function' ? messages(state.chatMessages) : messages,
    })),

  saveChatHistory: (messages, instruction) =>
    set(() => ({
      chatMessages: messages,
      ...(instruction !== undefined && { instruction }),
    })),

  setInstruction: (instruction) => set(() => ({ instruction })),

  setSuggestedMemories: (memories) => set(() => ({ suggestedMemories: memories })),

  setAgenticFlow: (isAgentic, sessionId) =>
    set(() => ({
      isAgenticFlow: isAgentic,
      agenticSessionId: sessionId || null,
    })),

  clearChatData: () =>
    set(() => ({
      chatMessages: [],
      instruction: '',
      suggestedMemories: [],
      isAgenticFlow: false,
      agenticSessionId: null,
    })),
});
