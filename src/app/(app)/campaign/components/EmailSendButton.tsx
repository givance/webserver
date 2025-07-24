import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Send, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useCommunications } from '@/app/hooks/use-communications';
import { toast } from 'sonner';

interface EmailSendButtonProps {
  emailId: number;
  donorName: string;
  donorEmail: string;
}

export function EmailSendButton({ emailId, donorName, donorEmail }: EmailSendButtonProps) {
  const { getEmailStatus, sendIndividualEmail, isLoadingSendIndividualEmail } = useCommunications();
  const [isLocalSending, setIsLocalSending] = useState(false);

  // Get email status - only query if emailId exists
  const {
    data: emailStatus,
    isLoading: isLoadingStatus,
    error: statusError,
  } = getEmailStatus(
    { emailId },
    {
      enabled: !!emailId && emailId > 0,
      retry: false, // Don't retry if email not found (e.g., after regeneration)
      staleTime: 0, // Always fetch fresh data
      refetchOnMount: false, // Don't refetch on mount if data exists
    }
  );

  const handleSendEmail = async () => {
    setIsLocalSending(true);
    try {
      const result = await sendIndividualEmail({ emailId });
      if (result?.success) {
        toast.success(`Email sent successfully to ${donorName}`);
      } else {
        toast.error(`Failed to send email to ${donorName}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(`Failed to send email to ${donorName}`);
    } finally {
      setIsLocalSending(false);
    }
  };

  const isSending = isLoadingSendIndividualEmail || isLocalSending;

  // Handle loading state
  if (isLoadingStatus) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-4 w-4 bg-muted rounded"></div>
            <span className="text-sm text-muted-foreground">Loading email status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle error state (e.g., email not found after regeneration)
  if (statusError) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Email status unavailable</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {emailStatus?.isSent ? (
              <>
                <Badge variant="default" className="text-xs flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Sent
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {emailStatus.sentAt && `Sent ${new Date(emailStatus.sentAt).toLocaleString()}`}
                </span>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Not Sent
                </Badge>
                <span className="text-sm text-muted-foreground">Ready to send to {donorEmail}</span>
              </>
            )}
          </div>

          {!emailStatus?.isSent && (
            <Button
              onClick={handleSendEmail}
              disabled={isSending}
              size="sm"
              className="flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Email
                </>
              )}
            </Button>
          )}
        </div>

        {emailStatus?.isSent && (
          <div className="mt-2 text-xs text-muted-foreground">
            This email has already been sent and cannot be sent again.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
