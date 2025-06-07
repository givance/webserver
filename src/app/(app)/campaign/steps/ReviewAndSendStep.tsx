"use client";

import { useDonors } from "@/app/hooks/use-donors";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { EmailPiece } from "@/app/lib/utils/email-generator/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { EmailDisplay } from "../components/EmailDisplay";

interface GeneratedEmail {
  donorId: number;
  subject: string;
  structuredContent: EmailPiece[];
}

interface ReviewAndSendStepProps {
  generatedEmails: GeneratedEmail[];
  onBack: () => void;
  onFinish: () => void;
}

export function ReviewAndSendStep({ generatedEmails, onBack, onFinish }: ReviewAndSendStepProps) {
  const [isSending, setIsSending] = useState(false);
  const { getDonorQuery } = useDonors();

  const handleSend = async () => {
    setIsSending(true);
    try {
      // In a real implementation, this would send the emails through your email service
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate sending
      onFinish();
    } catch (error) {
      console.error("Error sending emails:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Review and Send Emails</h3>
        <p className="text-sm text-muted-foreground">
          Review all generated emails before sending. Make sure the content is appropriate and personalized for each
          donor.
        </p>
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
              />
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex justify-between items-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="space-x-2">
          <span className="text-sm text-muted-foreground">{generatedEmails.length} emails ready to send</span>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? "Sending..." : "Send All Emails"}
          </Button>
        </div>
      </div>
    </div>
  );
}
