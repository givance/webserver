import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

/**
 * Hook to fix stuck campaigns by checking and updating their status
 */
export function useFixStuckCampaigns() {
  const utils = trpc.useUtils();

  return trpc.communications.campaigns.fixStuckCampaigns.useMutation({
    onSuccess: (result) => {
      toast.success(`Fixed ${result.fixedCount} out of ${result.totalChecked} campaigns`, {
        description: result.message,
      });

      // Invalidate campaigns list to refresh the data
      utils.communications.campaigns.listCampaigns.invalidate();
    },
    onError: (error) => {
      console.error("Failed to fix stuck campaigns:", error);
      toast.error("Failed to fix stuck campaigns", {
        description: error.message,
      });
    },
  });
}
