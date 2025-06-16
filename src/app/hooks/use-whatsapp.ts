import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

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
      toast.error(error.message || "Failed to add phone number");
    },
  });

  const removePhoneNumberMutation = trpc.whatsapp.removePhoneNumber.useMutation({
    onSuccess: () => {
      toast.success("Phone number removed successfully");
      // Invalidate phone numbers query to refetch
      utils.whatsapp.getStaffPhoneNumbers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove phone number");
    },
  });

  // Functions to expose
  const addPhoneNumber = async (staffId: number, phoneNumber: string) => {
    return addPhoneNumberMutation.mutateAsync({ staffId, phoneNumber });
  };

  const removePhoneNumber = async (staffId: number, phoneNumber: string) => {
    return removePhoneNumberMutation.mutateAsync({ staffId, phoneNumber });
  };

  const getStaffPhoneNumbers = (staffId: number) => {
    return trpc.whatsapp.getStaffPhoneNumbers.useQuery({ staffId }, { enabled: !!staffId });
  };

  const getActivityLog = (staffId: number, limit?: number, offset?: number) => {
    return trpc.whatsapp.getActivityLog.useQuery({ staffId, limit, offset }, { enabled: !!staffId });
  };

  const getActivityStats = (staffId: number, days?: number) => {
    return trpc.whatsapp.getActivityStats.useQuery({ staffId, days }, { enabled: !!staffId });
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
    isAddingPhone: addPhoneNumberMutation.isPending,
    isRemovingPhone: removePhoneNumberMutation.isPending,

    // Query functions (these return react-query results)
    getStaffPhoneNumbers,
    getActivityLog,
    getActivityStats,
    checkPhonePermission,
  };
}
