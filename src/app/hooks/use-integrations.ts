import { trpc } from '@/app/lib/trpc/client';

export function useIntegrations() {
  const utils = trpc.useUtils();

  const getStaffIntegrations = (staffId?: number) => {
    return trpc.integrations.getStaffIntegrations.useQuery({ staffId });
  };

  const getIntegrationSyncStatus = (integrationId: number, options?: { enabled?: boolean }) => {
    return trpc.integrations.getIntegrationSyncStatus.useQuery(
      { integrationId },
      {
        enabled: options?.enabled ?? true,
        refetchInterval: 5000, // Check status every 5 seconds
        refetchOnWindowFocus: false,
      }
    );
  };

  const getIntegrationAuthUrl = trpc.integrations.getIntegrationAuthUrl.useMutation();

  const handleIntegrationCallback = trpc.integrations.handleIntegrationCallback.useMutation();

  const syncIntegrationData = trpc.integrations.syncIntegrationData.useMutation();

  const disconnectIntegration = trpc.integrations.disconnectIntegration.useMutation({
    onSuccess: () => {
      // Invalidate queries after disconnecting
      utils.integrations.getStaffIntegrations.invalidate();
      utils.integrations.getIntegrationSyncStatus.invalidate();
    },
  });

  return {
    getStaffIntegrations,
    getIntegrationSyncStatus,
    getIntegrationAuthUrl,
    handleIntegrationCallback,
    syncIntegrationData,
    disconnectIntegration,
  };
}
