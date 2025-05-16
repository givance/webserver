import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
}

function ReferenceTooltip({ referenceId, context }: { referenceId: string; context: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="ml-2 cursor-help">
            {referenceId}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs whitespace-pre-wrap text-sm">{context}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EmailDisplay({ donorName, donorEmail, subject, content, referenceContexts }: EmailDisplayProps) {
  return (
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
            <div key={index} className="flex flex-wrap items-start gap-1">
              <div className={`flex flex-wrap gap-1 ${piece.addNewlineAfter ? "mb-4" : ""}`}>
                <p className="whitespace-pre-wrap">{piece.piece}</p>
                <div className="flex flex-wrap gap-1">
                  {piece.references.map((ref) => (
                    <ReferenceTooltip
                      key={ref}
                      referenceId={ref}
                      context={referenceContexts[ref] || "Context not available"}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
