/**
 * Reusable Gmail Connect Component
 *
 * This component handles Gmail authentication and connection for different contexts:
 * - User settings (connects user's Gmail to organization)
 * - Staff management (links user's Gmail token to specific staff member)
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MailX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/app/lib/trpc/client';

export interface GmailConnectProps {
  /**
   * Context determines the behavior:
   * - "settings": Connects user's Gmail account to organization (default)
   * - "staff": Links user's Gmail token to specific staff member
   */
  context?: 'settings' | 'staff';

  /**
   * Staff ID - required when context is "staff"
   */
  staffId?: number;

  /**
   * Title for the card
   */
  title?: string;

  /**
   * Description for the card
   */
  description?: string;

  /**
   * Additional class name for styling
   */
  className?: string;

  /**
   * Callback function called when connection status changes
   */
  onConnectionChange?: (isConnected: boolean) => void;

  /**
   * Show connection status and email
   */
  showConnectionStatus?: boolean;
}

export function GmailConnect({
  context = 'settings',
  staffId,
  title,
  description,
  className,
  onConnectionChange,
  showConnectionStatus = true,
}: GmailConnectProps) {
  // User-level OAuth is deprecated, but keep the mutation for compatibility
  const gmailAuthMutation = trpc.gmail.getGmailAuthUrl.useMutation({
    onSuccess: (data) => {
      // This should work but will use deprecated auth
      toast.error(
        'User-level Gmail authentication is deprecated. Please connect Gmail accounts through Staff settings.'
      );
    },
    onError: (error) => {
      toast.error(
        error.message ||
          'User-level Gmail authentication is deprecated. Please connect Gmail accounts through Staff settings.'
      );
    },
  });

  const staffGmailAuthMutation = trpc.staffGmail.getStaffGmailAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error('Could not get Gmail authentication URL. Please try again.');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to initiate Gmail connection. Please try again.');
    },
  });

  const disconnectGmailMutation = trpc.gmail.disconnectGmail.useMutation({
    onSuccess: () => {
      toast.success('Gmail account disconnected successfully');
      onConnectionChange?.(false);
      // Refetch connection status
      if (context === 'settings') {
        refetchGmailStatus();
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disconnect Gmail account');
    },
  });

  const disconnectStaffGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      toast.success('Gmail account disconnected successfully');
      onConnectionChange?.(false);
      // Refetch connection status
      if (context === 'staff' && staffId) {
        refetchStaffStatus();
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disconnect Gmail account');
    },
  });

  const {
    data: gmailConnectionStatus,
    isLoading: isStatusLoading,
    refetch: refetchGmailStatus,
  } = trpc.gmail.getGmailConnectionStatus.useQuery(undefined, { enabled: context === 'settings' });

  const {
    data: staffGmailStatus,
    isLoading: isStaffStatusLoading,
    refetch: refetchStaffStatus,
  } = trpc.staffGmail.getStaffGmailConnectionStatus.useQuery(
    { staffId: staffId! },
    { enabled: context === 'staff' && !!staffId }
  );

  const handleConnectGmail = () => {
    if (context === 'staff') {
      if (!staffId) {
        toast.error('Staff ID is required');
        return;
      }
      staffGmailAuthMutation.mutate({ staffId });
    } else {
      // Settings context - user-level OAuth is deprecated
      toast.error(
        'User-level Gmail authentication is deprecated. Please connect Gmail accounts through Staff settings.'
      );
    }
  };

  const handleDisconnectGmail = () => {
    disconnectGmailMutation.mutate();
  };

  const handleDisconnectStaffGmail = () => {
    if (!staffId) {
      toast.error('Staff ID is required');
      return;
    }
    disconnectStaffGmailMutation.mutate({ staffId });
  };

  const isLoading =
    gmailAuthMutation.isPending ||
    staffGmailAuthMutation.isPending ||
    disconnectGmailMutation.isPending ||
    disconnectStaffGmailMutation.isPending ||
    isStatusLoading ||
    isStaffStatusLoading;

  // Determine button text and action based on context
  const getButtonConfig = () => {
    if (context === 'settings') {
      if (gmailConnectionStatus?.isConnected) {
        return {
          text: 'Gmail Connected',
          disabled: true,
          variant: 'default' as const,
          icon: <Mail className="h-4 w-4 mr-2" />,
        };
      } else {
        return {
          text: isLoading ? 'Connecting...' : 'Connect Gmail Account',
          disabled: isLoading,
          variant: 'default' as const,
          icon: isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 mr-2" />
          ),
        };
      }
    } else {
      // Staff context
      return {
        text: isLoading ? 'Connecting...' : 'Connect Gmail Account',
        disabled: isLoading,
        variant: 'default' as const,
        icon: isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Mail className="h-4 w-4 mr-2" />
        ),
      };
    }
  };

  const buttonConfig = getButtonConfig();

  const defaultTitle = context === 'settings' ? 'Gmail Connection' : 'Link Gmail Account';
  const defaultDescription =
    context === 'settings'
      ? 'Connect your Gmail account to allow the application to compose and send emails on your behalf.'
      : 'Link your Gmail account to this staff member to enable sending emails from their profile.';

  if (!showConnectionStatus && context === 'settings') {
    // Compact mode for inline usage
    return (
      <Button
        onClick={handleConnectGmail}
        disabled={buttonConfig.disabled}
        variant={buttonConfig.variant}
        className={className}
      >
        {buttonConfig.icon}
        {buttonConfig.text}
      </Button>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title || defaultTitle}</CardTitle>
        <CardDescription>{description || defaultDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {isStatusLoading || isStaffStatusLoading ? (
          <p>Loading Gmail connection status...</p>
        ) : context === 'settings' ? (
          // Settings context
          gmailConnectionStatus?.isConnected &&
          gmailConnectionStatus &&
          'email' in gmailConnectionStatus &&
          gmailConnectionStatus.email ? (
            <div className="space-y-4">
              <div className="flex flex-col items-start space-y-2">
                <p className="text-green-600 font-semibold">Gmail account connected.</p>
                <p>
                  Email:{' '}
                  {gmailConnectionStatus && 'email' in gmailConnectionStatus
                    ? gmailConnectionStatus.email
                    : 'Unknown'}
                </p>
              </div>
              <Button onClick={handleDisconnectGmail} disabled={isLoading} variant="outline">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MailX className="h-4 w-4 mr-2" />
                )}
                Disconnect Gmail
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectGmail}
              disabled={buttonConfig.disabled}
              variant={buttonConfig.variant}
            >
              {buttonConfig.icon}
              {buttonConfig.text}
            </Button>
          )
        ) : (
          // Staff context
          <div className="space-y-4">
            {staffGmailStatus?.isConnected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">
                    Connected: {staffGmailStatus.email}
                  </span>
                </div>
                <Button onClick={handleDisconnectStaffGmail} disabled={isLoading} variant="outline">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MailX className="h-4 w-4 mr-2" />
                  )}
                  Disconnect Gmail
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConnectGmail}
                disabled={buttonConfig.disabled}
                variant={buttonConfig.variant}
              >
                {buttonConfig.icon}
                {buttonConfig.text}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
