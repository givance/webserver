'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';
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

interface StaffIntegrationCardProps {
  provider: {
    name: string;
    displayName: string;
    isSandbox?: boolean;
  };
  staffId: number;
}

export function StaffIntegrationCard({ provider, staffId }: StaffIntegrationCardProps) {
  const { getStaffIntegrations, getIntegrationAuthUrl, disconnectIntegration } = useIntegrations();

  // Add some debug logging
  React.useEffect(() => {
    console.log('StaffIntegrationCard mounted', { staffId, provider: provider.name });
  }, [staffId, provider.name]);

  const {
    data: integrations,
    isLoading: integrationsLoading,
    error,
  } = getStaffIntegrations(staffId);

  React.useEffect(() => {
    console.log('StaffIntegrationCard query result', {
      staffId,
      provider: provider.name,
      isLoading: integrationsLoading,
      hasData: !!integrations,
      dataLength: integrations?.length,
      error,
    });
  }, [staffId, provider.name, integrationsLoading, integrations, error]);

  const integration = integrations?.find((i) => i.provider === provider.name);
  const isConnected = integration?.isActive || false;

  React.useEffect(() => {
    if (integrations && integrations.length > 0) {
      console.log('StaffIntegrationCard - integration details', {
        staffId,
        provider: provider.name,
        allIntegrations: integrations,
        foundIntegration: integration,
        isConnected,
      });
    }
  }, [integrations, integration, isConnected, staffId, provider.name]);

  const connectMutation = getIntegrationAuthUrl;
  const disconnectMutation = disconnectIntegration;

  const handleConnect = () => {
    connectMutation.mutate(
      { provider: provider.name, staffId },
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

  const handleDisconnect = () => {
    if (!integration?.id) {
      toast.error('No integration found to disconnect');
      return;
    }

    disconnectMutation.mutate(
      { integrationId: integration.id },
      {
        onSuccess: () => {
          toast.success(`${provider.displayName} disconnected successfully`);
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to disconnect integration');
        },
      }
    );
  };

  if (integrationsLoading) {
    return (
      <Card className="opacity-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {provider.displayName}
              {provider.isSandbox && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Sandbox
                </Badge>
              )}
            </CardTitle>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={isConnected ? 'border-green-500/50 bg-green-50/5' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            {provider.displayName}
            {provider.isSandbox && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Sandbox
              </Badge>
            )}
          </CardTitle>
          {isConnected ? (
            <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="mr-1 h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </div>
        <CardDescription className="mt-1 text-sm">
          {isConnected
            ? `Connected to your ${provider.displayName} account`
            : `Connect your ${provider.displayName} account to sync data`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected && integration && (
          <>
            {/* Connection Info */}
            <div className="text-sm text-muted-foreground">
              {(integration.metadata as any)?.email && (
                <p>Email: {(integration.metadata as any).email}</p>
              )}
              {(integration.metadata as any)?.instanceUrl && (
                <p>Instance: {new URL((integration.metadata as any).instanceUrl).hostname}</p>
              )}
              {integration.lastSyncAt && (
                <p>Last sync: {format(new Date(integration.lastSyncAt), 'MMM d, yyyy h:mm a')}</p>
              )}
            </div>

            {/* Error Display */}
            {integration.syncError && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>Last sync had errors</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p>{integration.syncError}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isConnected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={connectMutation.isPending}>
              {connectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Connect {provider.displayName}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
