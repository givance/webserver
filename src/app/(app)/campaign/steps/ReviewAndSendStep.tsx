"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { useDonorStaffEmailValidation } from "@/app/hooks/use-donor-validation";
import { useDonors } from "@/app/hooks/use-donors";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { EmailPiece } from "@/app/lib/utils/email-generator/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmailDisplay } from "../components/EmailDisplay";

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

  // Use the validation hook
  const donorIds = generatedEmails.map((email) => email.donorId);
  const { data: validationResult, isLoading: isValidating } = useDonorStaffEmailValidation(donorIds);

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
      {/* Navigation at top */}
      <div className="flex justify-between items-center pb-2">
        <Button variant="outline" onClick={onBack} size="sm">
          <ArrowLeft className="w-3 h-3 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {generatedEmails.length} email(s) ready
            {validationResult && !validationResult.isValid ? " (setup issues)" : ""}
          </span>
          <Button
            onClick={handleScheduleSend}
            disabled={
              isScheduling ||
              generatedEmails.length === 0 ||
              isValidating ||
              (validationResult && !validationResult.isValid)
            }
            size="sm"
            className="flex items-center gap-2"
          >
            {isScheduling ? (
              <>
                <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                Scheduling...
              </>
            ) : isValidating ? (
              <>
                <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                Validating...
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                Schedule & Send
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Review and Schedule Emails</h3>
          <p className="text-sm text-muted-foreground">
            Review all generated emails before scheduling. Emails will be sent with a{" "}
            {scheduleConfig?.minGapMinutes || 1}-{scheduleConfig?.maxGapMinutes || 3} minute gap between each email.
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p>Daily sending limit: {scheduleConfig?.dailyLimit || 150} emails</p>
              <p>
                Emails will be scheduled with random gaps between {scheduleConfig?.minGapMinutes || 1}-
                {scheduleConfig?.maxGapMinutes || 3} minutes
              </p>
              <p>You can pause, resume, or cancel the sending at any time from the campaign page</p>
            </div>
          </AlertDescription>
        </Alert>

        {/* Email validation results */}
        {isValidating && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Validating email setup for all donors...</AlertDescription>
          </Alert>
        )}

        {validationResult && !validationResult.isValid && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Cannot schedule emails due to setup issues:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {validationResult.donorsWithoutStaff.length > 0 && (
                    <li>
                      {validationResult.donorsWithoutStaff.length} donor(s) don&apos;t have assigned staff members
                    </li>
                  )}
                  {validationResult.donorsWithStaffButNoEmail.length > 0 && (
                    <li>
                      {validationResult.donorsWithStaffButNoEmail.length} donor(s) have staff members without connected
                      Gmail accounts
                    </li>
                  )}
                </ul>
                <p className="text-sm">
                  Please assign staff to all donors and ensure all staff have connected their Gmail accounts in
                  Settings.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {validationResult && validationResult.isValid && (
          <Alert className="border-green-200 bg-green-50">
            <AlertCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              ✓ All donors have assigned staff with connected Gmail accounts. Ready to schedule!
            </AlertDescription>
          </Alert>
        )}
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
    </div>
  );
}
