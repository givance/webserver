import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTrackingStatus } from "./EmailTrackingStatus";

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
}

interface ReferencesDisplayProps {
  references: string[];
  referenceContexts: Record<string, string>;
}

function ReferencesDisplay({ references, referenceContexts }: ReferencesDisplayProps) {
  if (references.length === 0) return null;

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
}: EmailDisplayProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            To: {donorName} ({donorEmail})
          </CardTitle>
          <div className="text-sm font-medium mt-2">Subject: {subject}</div>
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

      {/* Email Tracking Status */}
      {emailId && donorId && <EmailTrackingStatus emailId={emailId} donorId={donorId} sessionId={sessionId} />}
    </div>
  );
}
