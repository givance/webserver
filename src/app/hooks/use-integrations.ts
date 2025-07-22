import { trpc } from '@/app/lib/trpc/client';

export function useIntegrations() {
  const utils = trpc.useUtils();

  const getOrganizationIntegrations = trpc.integrations.getOrganizationIntegrations.useQuery();

  const getIntegrationSyncStatus = (provider: string, options?: { enabled?: boolean }) => {
    return trpc.integrations.getIntegrationSyncStatus.useQuery(
      { provider },
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
      utils.integrations.getOrganizationIntegrations.invalidate();
      utils.integrations.getIntegrationSyncStatus.invalidate();
    },
  });

  return {
    getOrganizationIntegrations,
    getIntegrationSyncStatus,
    getIntegrationAuthUrl,
    handleIntegrationCallback,
    syncIntegrationData,
    disconnectIntegration,
  };
}
