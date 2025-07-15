/**
 * Unified Email Provider Connection Component
 *
 * This component allows staff members to connect either Gmail or Microsoft email accounts.
 * Each staff member can only have one email provider connected at a time.
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Mail, MailX, Link2, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/app/lib/trpc/client';
import { cn } from '@/lib/utils';

export interface EmailProviderConnectProps {
  staffId: number;
  gmailToken?: { id: number; email: string } | null;
  microsoftToken?: { id: number; email: string } | null;
  onConnectionChange?: () => void;
  variant?: 'inline' | 'dropdown';
  className?: string;
}

type EmailProvider = 'gmail' | 'microsoft';

export function EmailProviderConnect({
  staffId,
  gmailToken,
  microsoftToken,
  onConnectionChange,
  variant = 'inline',
  className,
}: EmailProviderConnectProps) {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [providerToDisconnect, setProviderToDisconnect] = useState<EmailProvider | null>(null);

  // Gmail mutations
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

  const disconnectGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      toast.success('Gmail account disconnected successfully');
      onConnectionChange?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disconnect Gmail account');
    },
  });

  // Microsoft mutations
  const staffMicrosoftAuthMutation = trpc.staffMicrosoft.getStaffMicrosoftAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error('Could not get Microsoft authentication URL. Please try again.');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to initiate Microsoft connection. Please try again.');
    },
  });

  const disconnectMicrosoftMutation = trpc.staffMicrosoft.disconnectStaffMicrosoft.useMutation({
    onSuccess: () => {
      toast.success('Microsoft account disconnected successfully');
      onConnectionChange?.();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disconnect Microsoft account');
    },
  });

  const isLoading =
    staffGmailAuthMutation.isPending ||
    staffMicrosoftAuthMutation.isPending ||
    disconnectGmailMutation.isPending ||
    disconnectMicrosoftMutation.isPending;

  const hasConnection = Boolean(gmailToken || microsoftToken);
  const currentProvider: EmailProvider | null = gmailToken
    ? 'gmail'
    : microsoftToken
      ? 'microsoft'
      : null;
  const currentEmail = gmailToken?.email || microsoftToken?.email;

  const handleConnect = (provider: EmailProvider) => {
    if (provider === 'gmail') {
      staffGmailAuthMutation.mutate({ staffId });
    } else {
      staffMicrosoftAuthMutation.mutate({ staffId });
    }
  };

  const handleDisconnect = () => {
    if (!providerToDisconnect) return;

    if (providerToDisconnect === 'gmail') {
      disconnectGmailMutation.mutate({ staffId });
    } else {
      disconnectMicrosoftMutation.mutate({ staffId });
    }
    setShowDisconnectDialog(false);
    setProviderToDisconnect(null);
  };

  const initiateDisconnect = (provider: EmailProvider) => {
    setProviderToDisconnect(provider);
    setShowDisconnectDialog(true);
  };

  // Inline variant - shows connection status with hover to disconnect
  if (variant === 'inline' && hasConnection) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="group relative">
          <Badge
            onClick={() => currentProvider && initiateDisconnect(currentProvider)}
            variant="default"
            className="bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 transition-all duration-200 cursor-pointer group-hover:bg-red-100 group-hover:text-red-700 h-6 px-2 py-0.5 text-xs inline-flex w-[140px] justify-center"
          >
            <Mail className="h-3 w-3 mr-1 group-hover:hidden" />
            <MailX className="h-3 w-3 mr-1 hidden group-hover:block" />
            <span className="group-hover:hidden">
              {currentProvider === 'gmail' ? 'Gmail' : 'Microsoft'} Connected
            </span>
            <span className="hidden group-hover:block">Disconnect</span>
          </Badge>
        </div>
        <div className="text-xs text-slate-500">{currentEmail}</div>

        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Disconnect {currentProvider === 'gmail' ? 'Gmail' : 'Microsoft'} Account
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect the email account &quot;{currentEmail}&quot; from this staff
                member. They will no longer be able to send emails through their connected account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setProviderToDisconnect(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDisconnect}
                className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
                disabled={isLoading}
              >
                {isLoading ? 'Disconnecting...' : 'Disconnect'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // No connection - show dropdown to select provider
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0 h-6 px-2 py-0.5 text-xs"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3 mr-1" />
                Link Email
                <ChevronDown className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => handleConnect('gmail')}
            disabled={isLoading}
            className="cursor-pointer text-xs"
          >
            <Mail className="h-3 w-3 mr-1.5" />
            Connect Gmail
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleConnect('microsoft')}
            disabled={isLoading}
            className="cursor-pointer text-xs"
          >
            <Mail className="h-3 w-3 mr-1.5" />
            Connect Microsoft 365
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
