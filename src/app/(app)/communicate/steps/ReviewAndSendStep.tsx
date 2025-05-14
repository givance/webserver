"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDonors } from "@/app/hooks/use-donors";

interface ReviewAndSendStepProps {
  generatedEmails: Array<{ donorId: number; content: string }>;
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
            return (
              <Card key={email.donorId}>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm">
                    Email for {donor?.firstName} {donor?.lastName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <pre className="whitespace-pre-wrap text-sm">{email.content}</pre>
                </CardContent>
              </Card>
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
