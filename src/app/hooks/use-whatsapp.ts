import { trpc } from '@/app/lib/trpc/client';
import { toast } from 'sonner';

/**
 * React hook for WhatsApp staff management operations
 * Provides functions to manage staff phone numbers and view activity
 */
export function useWhatsApp() {
  const utils = trpc.useUtils();

  // Phone number management mutations
  const addPhoneNumberMutation = trpc.whatsapp.addPhoneNumber.useMutation({
    onSuccess: (data) => {
      toast.success(`Phone number ${data.phoneNumber} added successfully`);
      // Invalidate phone numbers query to refetch
      utils.whatsapp.getStaffPhoneNumbers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add phone number');
    },
  });

  const removePhoneNumberMutation = trpc.whatsapp.removePhoneNumber.useMutation({
    onSuccess: () => {
      toast.success('Phone number removed successfully');
      // Invalidate phone numbers query to refetch
      utils.whatsapp.getStaffPhoneNumbers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove phone number');
    },
  });

  // Process test message mutation
  const processTestMessageMutation = trpc.whatsapp.processTestMessage.useMutation({
    onError: (error) => {
      toast.error(error.message || 'Failed to process message');
    },
  });

  // Functions to expose
  const addPhoneNumber = async (staffId: number, phoneNumber: string) => {
    try {
      return await addPhoneNumberMutation.mutateAsync({ staffId, phoneNumber });
    } catch (error) {
      console.error('Failed to add phone number:', error);
      throw error;
    }
  };

  const removePhoneNumber = async (staffId: number, phoneNumber: string) => {
    try {
      return await removePhoneNumberMutation.mutateAsync({ staffId, phoneNumber });
    } catch (error) {
      console.error('Failed to remove phone number:', error);
      throw error;
    }
  };

  const processTestMessage = async (
    message: string,
    phoneNumber: string,
    isTranscribed: boolean
  ) => {
    try {
      return await processTestMessageMutation.mutateAsync({ message, phoneNumber, isTranscribed });
    } catch (error) {
      console.error('Failed to process test message:', error);
      throw error;
    }
  };

  const getStaffPhoneNumbers = (staffId: number) => {
    return trpc.whatsapp.getStaffPhoneNumbers.useQuery({ staffId }, { enabled: !!staffId });
  };

  const getActivityLog = (staffId: number, limit?: number, offset?: number) => {
    return trpc.whatsapp.getActivityLog.useQuery(
      { staffId, limit, offset },
      { enabled: !!staffId }
    );
  };

  const getActivityStats = (staffId: number, days: number = 30) => {
    return trpc.whatsapp.getActivityStats.useQuery(
      { staffId, days },
      {
        enabled: !!staffId,
      }
    );
  };

  const getConversationHistory = (staffId: number, phoneNumber: string, limit: number = 20) => {
    return trpc.whatsapp.getConversationHistory.useQuery(
      { staffId, phoneNumber, limit },
      {
        enabled: !!staffId && !!phoneNumber,
      }
    );
  };

  const checkPhonePermission = (phoneNumber: string) => {
    return trpc.whatsapp.checkPhonePermission.useQuery(
      { phoneNumber },
      { enabled: !!phoneNumber && phoneNumber.length >= 10 }
    );
  };

  return {
    // Mutations
    addPhoneNumber,
    removePhoneNumber,
    processTestMessage,
    isAddingPhone: addPhoneNumberMutation.isPending,
    isRemovingPhone: removePhoneNumberMutation.isPending,
    isProcessingMessage: processTestMessageMutation.isPending,

    // Query functions (these return react-query results)
    getStaffPhoneNumbers,
    getActivityLog,
    getActivityStats,
    getConversationHistory,
    checkPhonePermission,
  };
}
