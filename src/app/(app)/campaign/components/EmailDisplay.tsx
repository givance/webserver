import { useCommunications } from "@/app/hooks/use-communications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit } from "lucide-react";
import { useState } from "react";
import { EmailEditModal } from "./EmailEditModal";
import { EmailSendButton } from "./EmailSendButton";
import { EmailTrackingStatus } from "./EmailTrackingStatus";
import { EmailEnhanceButton } from "./EmailEnhanceButton";

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface EmailDisplayProps {
  donorName: string;
  donorEmail: string;
  subject: string;
  content: EmailPiece[];
  referenceContexts: Record<string, string>; // Map of reference IDs to their context
  emailId?: number;
  donorId?: number;
  sessionId?: number;
  showSendButton?: boolean; // Control whether to show the send button
  showEditButton?: boolean; // Control whether to show the edit button
}

interface ReferencesDisplayProps {
  references: string[];
  referenceContexts: Record<string, string>;
}

function ReferencesDisplay({ references, referenceContexts }: ReferencesDisplayProps) {
  if (!references || references.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="cursor-help text-[10px] h-[16px] px-1 py-0 ml-0.5 relative -top-[1px] inline-flex items-center"
          >
            {references.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-2">
            {references.map((ref) => {
              const context = referenceContexts[ref];
              if (!context) {
                console.warn(`No context found for reference: ${ref}`);
                return null;
              }
              return (
                <div key={ref} className="text-sm">
                  <div className="text-muted-foreground whitespace-pre-wrap">{context}</div>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EmailDisplay({
  donorName,
  donorEmail,
  subject,
  content,
  referenceContexts,
  emailId,
  donorId,
  sessionId,
  showSendButton = true,
  showEditButton = true,
}: EmailDisplayProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { getEmailStatus } = useCommunications();

  // Get email status to check if sent - only query if emailId exists
  const { data: emailStatus } = getEmailStatus({ emailId: emailId || 0 }, { enabled: !!emailId && emailId > 0 });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-sm">
                To: {donorName} ({donorEmail})
              </CardTitle>
              <div className="text-sm font-medium mt-2">Subject: {subject}</div>
            </div>
            {emailId && !emailStatus?.isSent && showEditButton && (
              <div className="flex items-center gap-2">
                <EmailEnhanceButton
                  emailId={emailId}
                  currentSubject={subject}
                  currentContent={content}
                  currentReferenceContexts={referenceContexts}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm font-sans">
            {content.map((piece, index) => (
              <div key={index} className={piece.addNewlineAfter ? "mb-4" : ""}>
                <span className="whitespace-pre-wrap">{piece.piece}</span>
                <ReferencesDisplay references={piece.references} referenceContexts={referenceContexts} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email Send Button */}
      {emailId && showSendButton && <EmailSendButton emailId={emailId} donorName={donorName} donorEmail={donorEmail} />}

      {/* Email Tracking Status */}
      {emailId && donorId && <EmailTrackingStatus emailId={emailId} donorId={donorId} sessionId={sessionId} />}

      {/* Email Edit Modal */}
      {emailId && (
        <EmailEditModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          emailId={emailId}
          initialSubject={subject}
          initialContent={content}
          initialReferenceContexts={referenceContexts}
          donorName={donorName}
          donorEmail={donorEmail}
        />
      )}
    </div>
  );
}
