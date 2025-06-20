"use client";

import { useDonors } from "@/app/hooks/use-donors";
import { useCommunications } from "@/app/hooks/use-communications";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { EmailPiece } from "@/app/lib/utils/email-generator/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { EmailDisplay } from "../components/EmailDisplay";
import { toast } from "sonner";
import { Clock, Send, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface GeneratedEmail {
  donorId: number;
  subject: string;
  structuredContent: EmailPiece[];
}

interface ReviewAndSendStepProps {
  generatedEmails: GeneratedEmail[];
  sessionId: number;
  onBack: () => void;
  onFinish: () => void;
}

export function ReviewAndSendStep({ generatedEmails, sessionId, onBack, onFinish }: ReviewAndSendStepProps) {
  const [isScheduling, setIsScheduling] = useState(false);
  const { getDonorQuery } = useDonors();
  const { scheduleEmailSend, getScheduleConfig } = useCommunications();
  
  // Get schedule configuration
  const { data: scheduleConfig } = getScheduleConfig();

  const handleScheduleSend = async () => {
    setIsScheduling(true);
    try {
      const result = await scheduleEmailSend.mutateAsync({ sessionId });
      
      toast.success(
        `Successfully scheduled ${result.scheduled} emails. ${result.scheduledForToday} will be sent today, ${result.scheduledForLater} scheduled for later.`,
        {
          duration: 5000,
        }
      );
      
      onFinish();
    } catch (error) {
      console.error("Error scheduling emails:", error);
      toast.error("Failed to schedule emails. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Review and Schedule Emails</h3>
          <p className="text-sm text-muted-foreground">
            Review all generated emails before scheduling. Emails will be sent with a {scheduleConfig?.minGapMinutes || 1}-{scheduleConfig?.maxGapMinutes || 3} minute gap between each email.
          </p>
        </div>
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p>Daily sending limit: {scheduleConfig?.dailyLimit || 150} emails</p>
              <p>Emails will be scheduled with random gaps between {scheduleConfig?.minGapMinutes || 1}-{scheduleConfig?.maxGapMinutes || 3} minutes</p>
              <p>You can pause, resume, or cancel the sending at any time from the campaign page</p>
            </div>
          </AlertDescription>
        </Alert>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4">
          {generatedEmails.map((email) => {
            const { data: donor } = getDonorQuery(email.donorId);
            if (!donor) return null;

            return (
              <EmailDisplay
                key={email.donorId}
                donorName={formatDonorName(donor)}
                donorEmail={donor.email}
                subject={email.subject}
                content={email.structuredContent}
                referenceContexts={{}} // You might want to pass actual reference contexts here
                showSendButton={false}
              />
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{generatedEmails.length} emails ready to schedule</span>
          <Button 
            onClick={handleScheduleSend} 
            disabled={isScheduling || generatedEmails.length === 0}
            className="flex items-center gap-2"
          >
            {isScheduling ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Scheduling...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4" />
                Schedule & Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
