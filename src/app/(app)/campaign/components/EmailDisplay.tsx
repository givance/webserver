import { useCommunications } from "@/app/hooks/use-communications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit, Check, Clock } from "lucide-react";
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
  approvalStatus?: "PENDING_APPROVAL" | "APPROVED";
  onStatusChange?: (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => void;
  isUpdatingStatus?: boolean;
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
  approvalStatus = "PENDING_APPROVAL",
  onStatusChange,
  isUpdatingStatus = false,
}: EmailDisplayProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { getEmailStatus } = useCommunications();

  // Get email status to check if sent - only query if emailId exists
  const { data: emailStatus } = getEmailStatus({ emailId: emailId || 0 }, { enabled: !!emailId && emailId > 0 });

  return (
    <div className="space-y-4">
      {/* Approval status and controls */}
      {onStatusChange && emailId && !emailStatus?.isSent && (
        <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
          <div className="flex items-center gap-2">
            {approvalStatus === "APPROVED" ? (
              <>
                <Badge variant="default" className="bg-green-500">
                  <Check className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
                <span className="text-sm text-muted-foreground">This email has been approved</span>
              </>
            ) : (
              <>
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  Pending Approval
                </Badge>
                <span className="text-sm text-muted-foreground">This email needs review</span>
              </>
            )}
          </div>
          <Button
            variant={approvalStatus === "APPROVED" ? "outline" : "default"}
            size="sm"
            onClick={() => onStatusChange(emailId, approvalStatus === "APPROVED" ? "PENDING_APPROVAL" : "APPROVED")}
            disabled={isUpdatingStatus}
            className="min-w-[120px]"
          >
            {isUpdatingStatus ? (
              "Updating..."
            ) : approvalStatus === "APPROVED" ? (
              <>
                <Clock className="h-4 w-4 mr-1" />
                Mark Pending
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                Approve Email
              </>
            )}
          </Button>
        </div>
      )}

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
                  sessionId={sessionId}
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
            {content.map((piece, index) => {
              // Check if this is signature content or contains HTML
              const isSignature = piece.references.includes("signature");
              const containsHTML = /<[^>]+>/.test(piece.piece);
              const shouldRenderHTML = isSignature || containsHTML;

              return (
                <div key={index} className={piece.addNewlineAfter ? "mb-4" : ""}>
                  {shouldRenderHTML ? (
                    <div
                      className="prose prose-sm max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_img.signature-image]:max-h-20 [&_img.signature-image]:w-auto"
                      dangerouslySetInnerHTML={{ __html: piece.piece }}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{piece.piece}</span>
                  )}
                  {/* Only show references for non-signature content */}
                  {!isSignature && (
                    <ReferencesDisplay references={piece.references} referenceContexts={referenceContexts} />
                  )}
                </div>
              );
            })}
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
