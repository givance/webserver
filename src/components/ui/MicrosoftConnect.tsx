/**
 * Reusable Microsoft Connect Component
 *
 * This component handles Microsoft authentication and connection for different contexts:
 * - User settings (connects user's Microsoft to organization)
 * - Staff management (links user's Microsoft token to specific staff member)
 */

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MailX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/app/lib/trpc/client";

export interface MicrosoftConnectProps {
  /**
   * Context determines the behavior:
   * - "settings": Connects user's Microsoft account to organization (default)
   * - "staff": Links user's Microsoft token to specific staff member
   */
  context?: "settings" | "staff";

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

export function MicrosoftConnect({
  context = "settings",
  staffId,
  title,
  description,
  className,
  onConnectionChange,
  showConnectionStatus = true,
}: MicrosoftConnectProps) {
  const microsoftAuthMutation = trpc.microsoft.getMicrosoftAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error("Could not get Microsoft authentication URL. Please try again.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initiate Microsoft connection. Please try again.");
    },
  });

  const staffMicrosoftAuthMutation = trpc.staffMicrosoft.getStaffMicrosoftAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error("Could not get Microsoft authentication URL. Please try again.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initiate Microsoft connection. Please try again.");
    },
  });

  const disconnectMicrosoftMutation = trpc.microsoft.disconnectMicrosoft.useMutation({
    onSuccess: () => {
      toast.success("Microsoft account disconnected successfully");
      onConnectionChange?.(false);
      // Refetch connection status
      if (context === "settings") {
        refetchMicrosoftStatus();
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect Microsoft account");
    },
  });

  const disconnectStaffMicrosoftMutation = trpc.staffMicrosoft.disconnectStaffMicrosoft.useMutation({
    onSuccess: () => {
      toast.success("Microsoft account disconnected successfully");
      onConnectionChange?.(false);
      // Refetch connection status
      if (context === "staff" && staffId) {
        refetchStaffStatus();
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect Microsoft account");
    },
  });

  const {
    data: microsoftConnectionStatus,
    isLoading: isStatusLoading,
    refetch: refetchMicrosoftStatus,
  } = trpc.microsoft.getMicrosoftConnectionStatus.useQuery(undefined, { enabled: context === "settings" });

  const {
    data: staffMicrosoftStatus,
    isLoading: isStaffStatusLoading,
    refetch: refetchStaffStatus,
  } = trpc.staffMicrosoft.getStaffMicrosoftConnectionStatus.useQuery(
    { staffId: staffId! },
    { enabled: context === "staff" && !!staffId }
  );

  const handleConnectMicrosoft = () => {
    if (context === "staff") {
      if (!staffId) {
        toast.error("Staff ID is required");
        return;
      }
      staffMicrosoftAuthMutation.mutate({ staffId });
    } else {
      // Settings context - authenticate user's Microsoft
      microsoftAuthMutation.mutate();
    }
  };

  const handleDisconnectMicrosoft = () => {
    disconnectMicrosoftMutation.mutate();
  };

  const handleDisconnectStaffMicrosoft = () => {
    if (!staffId) {
      toast.error("Staff ID is required");
      return;
    }
    disconnectStaffMicrosoftMutation.mutate({ staffId });
  };

  const isLoading =
    microsoftAuthMutation.isPending ||
    staffMicrosoftAuthMutation.isPending ||
    disconnectMicrosoftMutation.isPending ||
    disconnectStaffMicrosoftMutation.isPending ||
    isStatusLoading ||
    isStaffStatusLoading;

  // Determine button text and action based on context
  const getButtonConfig = () => {
    if (context === "settings") {
      if (microsoftConnectionStatus?.isConnected) {
        return {
          text: "Microsoft Connected",
          disabled: true,
          variant: "default" as const,
          icon: <Mail className="h-4 w-4 mr-2" />,
        };
      } else {
        return {
          text: isLoading ? "Connecting..." : "Connect Microsoft Account",
          disabled: isLoading,
          variant: "default" as const,
          icon: isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />,
        };
      }
    } else {
      // Staff context
      return {
        text: isLoading ? "Connecting..." : "Connect Microsoft Account",
        disabled: isLoading,
        variant: "default" as const,
        icon: isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />,
      };
    }
  };

  const buttonConfig = getButtonConfig();

  const defaultTitle = context === "settings" ? "Microsoft Connection" : "Link Microsoft Account";
  const defaultDescription =
    context === "settings"
      ? "Connect your Microsoft account to allow the application to compose and send emails on your behalf."
      : "Link your Microsoft account to this staff member to enable sending emails from their profile.";

  if (!showConnectionStatus && context === "settings") {
    // Compact mode for inline usage
    return (
      <Button
        onClick={handleConnectMicrosoft}
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
          <p>Loading Microsoft connection status...</p>
        ) : context === "settings" ? (
          // Settings context
          microsoftConnectionStatus?.isConnected && microsoftConnectionStatus.email ? (
            <div className="space-y-4">
              <div className="flex flex-col items-start space-y-2">
                <p className="text-green-600 font-semibold">Microsoft account connected.</p>
                <p>Email: {microsoftConnectionStatus.email}</p>
              </div>
              <Button onClick={handleDisconnectMicrosoft} disabled={isLoading} variant="outline">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MailX className="h-4 w-4 mr-2" />}
                Disconnect Microsoft
              </Button>
            </div>
          ) : (
            <Button onClick={handleConnectMicrosoft} disabled={buttonConfig.disabled} variant={buttonConfig.variant}>
              {buttonConfig.icon}
              {buttonConfig.text}
            </Button>
          )
        ) : (
          // Staff context
          <div className="space-y-4">
            {staffMicrosoftStatus?.isConnected && staffMicrosoftStatus.email ? (
              <div className="space-y-4">
                <div className="flex flex-col items-start space-y-2">
                  <p className="text-green-600 font-semibold">Microsoft account connected.</p>
                  <p>Email: {staffMicrosoftStatus.email}</p>
                </div>
                <Button onClick={handleDisconnectStaffMicrosoft} disabled={isLoading} variant="outline">
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MailX className="h-4 w-4 mr-2" />}
                  Disconnect Microsoft
                </Button>
              </div>
            ) : (
              <Button onClick={handleConnectMicrosoft} disabled={buttonConfig.disabled} variant={buttonConfig.variant}>
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
