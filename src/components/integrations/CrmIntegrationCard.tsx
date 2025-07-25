'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Unlink,
  FlaskConical,
  Settings,
} from 'lucide-react';
import { useIntegrations } from '@/app/hooks/use-integrations';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Link from 'next/link';

interface CrmIntegrationCardProps {
  provider: {
    name: string;
    displayName: string;
    isSandbox?: boolean;
  };
}

export function CrmIntegrationCard({ provider }: CrmIntegrationCardProps) {
  const {
    getOrganizationIntegrations,
    getIntegrationSyncStatus,
    getIntegrationAuthUrl,
    syncIntegrationData,
    disconnectIntegration,
  } = useIntegrations();

  const { data: integrations, isLoading: integrationsLoading } = getOrganizationIntegrations;

  const isIntegrationActive =
    integrations?.some((i) => i.provider === provider.name && i.isActive) || false;

  const { data: syncStatus, isLoading: statusLoading } = getIntegrationSyncStatus(provider.name, {
    enabled: isIntegrationActive,
  });

  const connectMutation = getIntegrationAuthUrl;
  const syncMutation = syncIntegrationData;
  const disconnectMutation = disconnectIntegration;

  const isConnected = syncStatus?.isActive;
  const isSyncing = syncStatus?.syncStatus === 'syncing';

  const handleConnect = () => {
    connectMutation.mutate(
      { provider: provider.name },
      {
        onSuccess: (data) => {
          window.location.href = data.authUrl;
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to initiate connection');
        },
      }
    );
  };

  const handleSync = () => {
    syncMutation.mutate(
      { provider: provider.name },
      {
        onSuccess: () => {
          toast.success('Sync initiated successfully');
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to initiate sync');
        },
      }
    );
  };

  const handleDisconnect = () => {
    if (confirm(`Are you sure you want to disconnect ${provider.displayName}?`)) {
      disconnectMutation.mutate(
        { provider: provider.name },
        {
          onSuccess: () => {
            toast.success(`${provider.displayName} disconnected successfully`);
          },
          onError: (error) => {
            toast.error(error.message || 'Failed to disconnect integration');
          },
        }
      );
    }
  };
  const hasError = syncStatus?.syncStatus === 'error';

  const getSyncStatusIcon = () => {
    if (isSyncing) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (hasError) return <XCircle className="h-4 w-4 text-destructive" />;
    if (isConnected) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const getSyncStatusText = () => {
    if (isSyncing) return 'Syncing...';
    if (hasError) return 'Sync failed';
    if (syncStatus?.lastSyncAt) {
      return `Last synced ${format(new Date(syncStatus.lastSyncAt), 'MMM d, yyyy h:mm a')}`;
    }
    return 'Never synced';
  };

  if (integrationsLoading || statusLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {provider.displayName}
              {provider.isSandbox && (
                <Badge variant="outline" className="gap-1">
                  <FlaskConical className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Sync donor and donation data from {provider.displayName}
              {provider.isSandbox && ' (Test Environment)'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getSyncStatusIcon()}
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? 'Connected' : 'Not connected'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && (
          <div className="text-sm text-muted-foreground">
            {getSyncStatusText()}
            {hasError && syncStatus?.syncError && (
              <p className="text-destructive mt-1">{syncStatus.syncError}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={connectMutation.isPending} className="w-full">
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSync}
                disabled={isSyncing || syncMutation.isPending}
                variant="outline"
                className="flex-1"
              >
                {isSyncing || syncMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                variant="destructive"
                size="icon"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Debug link for providers that have debug pages */}
        {(provider.name === 'blackbaud' || provider.name === 'salesforce') && (
          <div className="pt-2 border-t">
            <Link href={`/settings/integrations/${provider.name}-debug`}>
              <Button variant="ghost" size="sm" className="text-xs w-full">
                <Settings className="mr-1 h-3 w-3" />
                Configuration & Setup Guide
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
