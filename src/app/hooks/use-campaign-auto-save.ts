'use client';

import { useRef, useCallback, useState } from 'react';
import { useCommunications } from './use-communications';
import { toast } from 'react-hot-toast';

interface CampaignDraftData {
  sessionId?: number;
  campaignName?: string;
  selectedDonorIds?: number[];
  templateId?: number;
  instruction?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface UseCampaignAutoSaveOptions {
  debounceMs?: number;
  onSessionIdChange?: (sessionId: number) => void;
}

export function useCampaignAutoSave(options: UseCampaignAutoSaveOptions = {}) {
  const { debounceMs = 1000, onSessionIdChange } = options;
  const { saveDraft } = useCommunications();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<string>('');

  const autoSave = useCallback(
    async (data: CampaignDraftData) => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Create a hash of the current data to compare with last saved
      const dataHash = JSON.stringify({
        sessionId: data.sessionId,
        campaignName: data.campaignName?.trim(),
        selectedDonorIds: data.selectedDonorIds || [],
        templateId: data.templateId,
        instruction: data.instruction?.trim(),
        chatHistory: data.chatHistory || [],
      });

      // Don't save if data hasn't changed
      if (dataHash === lastSavedData) {
        return;
      }

      // Validate required fields
      if (!data.campaignName?.trim() || !data.selectedDonorIds?.length) {
        return; // Don't auto-save if required fields are missing
      }

      // Set up auto-save timeout
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const payload = {
            sessionId: data.sessionId,
            campaignName: data.campaignName!.trim(),
            selectedDonorIds: data.selectedDonorIds!,
            templateId: data.templateId,
            instruction: data.instruction?.trim(),
            chatHistory: data.chatHistory,
          };

          const result = await saveDraft(payload);

          // Update session ID if this was a new draft
          if (!data.sessionId && result.sessionId && onSessionIdChange) {
            onSessionIdChange(result.sessionId);
          }

          setLastSavedData(dataHash);
        } catch (error) {
          console.error('Failed to auto-save campaign draft:', error);
          // Don't show toast for auto-save failures as they can be annoying
          // The user will still be able to save manually if needed
        } finally {
          setIsSaving(false);
        }
      }, debounceMs);
    },
    [debounceMs, saveDraft, lastSavedData, onSessionIdChange]
  );

  // Manual save function for when users explicitly want to save
  const manualSave = useCallback(
    async (data: CampaignDraftData) => {
      // Clear any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setIsSaving(true);
      try {
        const payload = {
          sessionId: data.sessionId,
          campaignName: data.campaignName!.trim(),
          selectedDonorIds: data.selectedDonorIds!,
          templateId: data.templateId,
          instruction: data.instruction?.trim(),
          chatHistory: data.chatHistory,
        };

        const result = await saveDraft(payload);

        // Update session ID if this was a new draft
        if (!data.sessionId && result.sessionId && onSessionIdChange) {
          onSessionIdChange(result.sessionId);
        }

        const dataHash = JSON.stringify(payload);
        setLastSavedData(dataHash);

        toast.success('Campaign saved successfully!');
        return result;
      } catch (error) {
        console.error('Failed to save campaign draft:', error);
        toast.error('Failed to save campaign. Please try again.');
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [saveDraft, onSessionIdChange]
  );

  // Cleanup function
  const cleanup = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, []);

  return {
    autoSave,
    manualSave,
    isSaving,
    cleanup,
  };
}
