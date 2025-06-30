import { useCommunications } from "@/app/hooks/use-communications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit, Check, Clock, Sparkles, AlertCircle, Info, HelpCircle, DollarSign, Calendar, Hash } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { EmailEditModal } from "./EmailEditModal";
import { EmailSendButton } from "./EmailSendButton";
import { EmailTrackingStatus } from "./EmailTrackingStatus";
import { EmailEnhanceButton } from "./EmailEnhanceButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/app/lib/trpc/client";

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface EmailDisplayProps {
  donorName: string;
  donorEmail: string;
  subject: string;
  // Legacy format (structured content)
  content?: EmailPiece[];
  referenceContexts?: Record<string, string>; // Map of reference IDs to their context
  // New format
  emailContent?: string;
  reasoning?: string;
  emailId?: number;
  donorId?: number;
  sessionId?: number;
  showSendButton?: boolean; // Control whether to show the send button
  showEditButton?: boolean; // Control whether to show the edit button
  approvalStatus?: "PENDING_APPROVAL" | "APPROVED";
  onStatusChange?: (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => void;
  isUpdatingStatus?: boolean;
  // Preview mode props
  isPreviewMode?: boolean; // When true, enables edit/enhance without emailId
  onPreviewEdit?: (donorId: number, subject: string, content: EmailPiece[]) => void;
  onPreviewEnhance?: (donorId: number, instruction: string) => void;
  onPreviewStatusChange?: (donorId: number, status: "PENDING_APPROVAL" | "APPROVED") => void;
  // Staff information
  staffName?: string;
  staffEmail?: string | null;
  hasLinkedEmail?: boolean;
  defaultStaffEmail?: string;
}

interface ReferencesDisplayProps {
  references: string[];
  referenceContexts: Record<string, string>;
}

// Simple edit modal for preview mode
interface PreviewEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: number;
  initialSubject: string;
  initialContent: EmailPiece[];
  donorName: string;
  donorEmail: string;
  onSave: (subject: string, content: EmailPiece[]) => void;
}

function PreviewEditModal({
  open,
  onOpenChange,
  donorId,
  initialSubject,
  initialContent,
  donorName,
  donorEmail,
  onSave,
}: PreviewEditModalProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState("");

  // Convert structured content to plain text (excluding signatures)
  const structuredToPlainText = (structuredContent: EmailPiece[]): string => {
    // Remove signature pieces
    const contentWithoutSignature = structuredContent.filter((piece) => !piece.references?.includes("signature"));

    return contentWithoutSignature
      .map((piece) => piece.piece + (piece.addNewlineAfter ? "\n\n" : ""))
      .join("")
      .trim();
  };

  // Convert plain text to structured content
  const plainTextToStructured = (text: string): EmailPiece[] => {
    if (!text.trim()) {
      return [{ piece: "", references: [], addNewlineAfter: false }];
    }

    // Split by double newlines to create paragraphs
    const paragraphs = text.split(/\n\s*\n/);

    return paragraphs.map((paragraph, index) => ({
      piece: paragraph.trim(),
      references: [], // We lose reference information in the simplified editor
      addNewlineAfter: index < paragraphs.length - 1, // Add newline after all except the last
    }));
  };

  // Initialize content when modal opens
  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setContent(structuredToPlainText(initialContent));
    }
  }, [open, initialSubject, initialContent]);

  const handleSave = () => {
    const structuredContent = plainTextToStructured(content);
    // Signature will be appended automatically when displaying
    onSave(subject, structuredContent);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Email</DialogTitle>
          <DialogDescription>
            Edit the email content for {donorName} ({donorEmail})
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="space-y-2 flex-shrink-0">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="w-full"
              />
            </div>
            <div className="space-y-2 flex-1 flex flex-col min-h-0 mt-4">
              <Label htmlFor="content">Email Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter email content..."
                className="flex-1 min-h-0 resize-none w-full"
              />
              <p className="text-xs text-muted-foreground flex-shrink-0">Use double line breaks to create paragraphs</p>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-shrink-0 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  emailContent,
  reasoning,
  emailId,
  donorId,
  sessionId,
  showSendButton = true,
  showEditButton = true,
  approvalStatus = "PENDING_APPROVAL",
  onStatusChange,
  isUpdatingStatus = false,
  isPreviewMode = false,
  onPreviewEdit,
  onPreviewEnhance,
  onPreviewStatusChange,
  staffName,
  staffEmail,
  hasLinkedEmail = true,
  defaultStaffEmail,
}: EmailDisplayProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [previewSubject, setPreviewSubject] = useState(subject);
  const [previewContent, setPreviewContent] = useState(content || []);

  // Donation tooltip state
  const [isLoadingDonations, setIsLoadingDonations] = useState(false);
  const [donorDonations, setDonorDonations] = useState<{
    donations: any[];
    totalCount: number;
    totalAmount: number;
  } | null>(null);

  const { getEmailStatus } = useCommunications();
  const utils = trpc.useUtils();

  // Helper functions for donation tooltip
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100); // Convert cents to dollars
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Load donor donations function
  const loadDonorDonations = useCallback(
    async (donorId: number) => {
      if (isLoadingDonations || donorDonations) return;

      setIsLoadingDonations(true);

      try {
        // Get accurate donation statistics
        const statsResult = await utils.donations.getDonorStats.fetch({ donorId });

        // Get recent donations for display
        const donationsResult = await utils.donations.list.fetch({
          donorId,
          limit: 20,
          orderBy: "date",
          orderDirection: "desc",
          includeProject: true,
        });

        if (statsResult && donationsResult) {
          setDonorDonations({
            donations: donationsResult.donations,
            totalCount: donationsResult.totalCount, // Total count of all donations
            totalAmount: statsResult.totalDonated, // Accurate total amount from stats
          });
        }
      } catch (error) {
        console.error("Failed to load donations:", error);
      } finally {
        setIsLoadingDonations(false);
      }
    },
    [utils.donations.list, utils.donations.getDonorStats, isLoadingDonations, donorDonations]
  );

  // Determine which format to use
  const isNewFormat = emailContent !== undefined && emailContent !== null && emailContent.trim().length > 0;
  const isLegacyFormat = content !== undefined && content.length > 0;

  // Get email status to check if sent - only query if emailId exists
  const { data: emailStatus } = getEmailStatus({ emailId: emailId || 0 }, { enabled: !!emailId && emailId > 0 });

  // For legacy format, we may need to fetch signature separately
  const displayContent = isPreviewMode ? previewContent : content || [];
  const { data: signatureData } = trpc.emailCampaigns.getEmailWithSignature.useQuery(
    {
      donorId: donorId || 0,
      structuredContent: displayContent,
    },
    {
      enabled: !!donorId && displayContent.length > 0 && isLegacyFormat && !isNewFormat && !isPreviewMode,
      staleTime: 10 * 60 * 1000, // Cache for 10 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnWindowFocus: false, // Prevent refetch on focus to reduce calls
      refetchOnMount: false, // Prevent refetch on mount if data exists
    }
  );

  // For new format, fetch plain text email content with signature
  const { data: plainTextSignatureData } = trpc.emailCampaigns.getPlainTextEmailWithSignature.useQuery(
    {
      donorId: donorId || 0,
      emailContent: emailContent || "",
    },
    {
      enabled: !!donorId && !!emailContent && isNewFormat && !isPreviewMode,
      staleTime: 10 * 60 * 1000, // Cache for 10 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnWindowFocus: false, // Prevent refetch on focus to reduce calls
      refetchOnMount: false, // Prevent refetch on mount if data exists
    }
  );

  // Use signature-appended content for legacy format when available, otherwise use provided content
  const contentWithSignature =
    signatureData && isLegacyFormat && !isNewFormat ? signatureData.structuredContent : displayContent;

  // Use signature-appended content for new format when available
  const emailContentWithSignature =
    plainTextSignatureData && isNewFormat ? plainTextSignatureData.emailContent : emailContent;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="space-y-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>To:</span>
                  {donorId ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild onMouseEnter={() => loadDonorDonations(donorId)}>
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/donors/${donorId}`}
                              className="text-primary hover:underline font-medium"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {donorName}
                            </Link>
                            <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60 cursor-help" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="max-w-sm p-0 bg-background border">
                          <div className="p-4 space-y-3">
                            <div className="font-semibold text-sm border-b pb-2">{donorName}</div>

                            {isLoadingDonations ? (
                              <div className="text-sm text-gray-600 dark:text-gray-400">Loading donations...</div>
                            ) : donorDonations ? (
                              <>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <div className="text-gray-600 dark:text-gray-400">Total Donations</div>
                                    <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                      <Hash className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                      {donorDonations.totalCount || 0}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 dark:text-gray-400">Total Amount</div>
                                    <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                      <DollarSign className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                      {formatCurrency(donorDonations.totalAmount || 0)}
                                    </div>
                                  </div>
                                </div>

                                {donorDonations.donations.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      Recent Donations
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {donorDonations.donations.slice(0, 20).map((donation: any, idx: number) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Calendar className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                            <span className="text-gray-900 dark:text-gray-100">
                                              {formatDate(donation.date)}
                                            </span>
                                            {donation.project && (
                                              <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                                • {donation.project.name}
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-medium text-gray-900 dark:text-gray-100">
                                            {formatCurrency(donation.amount)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-gray-600 dark:text-gray-400">No donations found</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="font-medium">{donorName}</span>
                  )}
                  <span className="font-normal text-muted-foreground">({donorEmail})</span>
                </CardTitle>
                {staffName && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>Assigned to:</span>
                    <span className="font-medium">{staffName}</span>
                    {hasLinkedEmail && staffEmail ? (
                      <span className="text-xs">({staffEmail})</span>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5 cursor-help">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              No linked email
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>This staff member doesn&apos;t have a linked email account.</p>
                            <p className="mt-1">
                              Emails will be sent from:{" "}
                              <span className="font-medium">
                                {defaultStaffEmail || "the default organization email"}
                              </span>
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
              </div>
              <div className="text-sm font-medium mt-2">Subject: {isPreviewMode ? previewSubject : subject}</div>
            </div>
            {((emailId && !emailStatus?.isSent) || isPreviewMode) && showEditButton && (
              <div className="flex items-center gap-2">
                {((onStatusChange && emailId) || (isPreviewMode && onPreviewStatusChange && donorId)) &&
                  !emailStatus?.isSent && (
                    <Button
                      variant={approvalStatus === "APPROVED" ? "outline" : "default"}
                      size="sm"
                      onClick={() => {
                        if (isPreviewMode && onPreviewStatusChange && donorId) {
                          onPreviewStatusChange(
                            donorId,
                            approvalStatus === "APPROVED" ? "PENDING_APPROVAL" : "APPROVED"
                          );
                        } else if (onStatusChange && emailId) {
                          onStatusChange(emailId, approvalStatus === "APPROVED" ? "PENDING_APPROVAL" : "APPROVED");
                        }
                      }}
                      disabled={isUpdatingStatus}
                      className="flex items-center gap-2"
                    >
                      {isUpdatingStatus ? (
                        "Updating..."
                      ) : approvalStatus === "APPROVED" ? (
                        <>
                          <Clock className="h-4 w-4" />
                          Mark Pending
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Approve Email
                        </>
                      )}
                    </Button>
                  )}
                <EmailEnhanceButton
                  emailId={emailId || 0}
                  sessionId={sessionId}
                  currentSubject={isPreviewMode ? previewSubject : subject}
                  currentContent={isPreviewMode ? previewContent : content || []}
                  currentReferenceContexts={referenceContexts || {}}
                  isPreviewMode={isPreviewMode}
                  onPreviewEnhance={
                    isPreviewMode && onPreviewEnhance && donorId
                      ? (instruction) => onPreviewEnhance(donorId, instruction)
                      : undefined
                  }
                  onEnhanced={
                    isPreviewMode
                      ? (newSubject, newContent) => {
                          setPreviewSubject(newSubject);
                          setPreviewContent(newContent);
                        }
                      : undefined
                  }
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
            {isNewFormat ? (
              // New format: Show plain email content without references
              <div>
                {/* Show reasoning for new format emails */}
                {reasoning && (
                  <div className="mt-2 p-2 bg-muted/30 rounded-md border">
                    <div className="flex items-center gap-2 mb-1">
                      <Info className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">AI Generation Strategy</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-light leading-relaxed">{reasoning}</p>
                  </div>
                )}

                {/* Handle email content with potential HTML signature */}
                {(() => {
                  const content = emailContentWithSignature || emailContent || "";

                  // Check if content contains HTML (likely from signature)
                  const hasHTML = /<[^>]+>/.test(content);

                  if (!hasHTML) {
                    // No HTML, render as plain text
                    return <div className="whitespace-pre-wrap">{content}</div>;
                  }

                  // Content has HTML, try to split email content from signature
                  // Look for the last double newline before HTML content
                  let emailPart = content;
                  let signaturePart = "";

                  // Find the last occurrence of \n\n followed by content that contains HTML
                  const splitRegex = /\n\n/g;
                  const matches = [];
                  let match;

                  while ((match = splitRegex.exec(content)) !== null) {
                    matches.push(match.index);
                  }

                  // Work backwards through the matches to find the split point
                  for (let i = matches.length - 1; i >= 0; i--) {
                    const splitIndex = matches[i] + 2; // +2 to skip the \n\n
                    const afterSplit = content.substring(splitIndex);

                    // If the content after this split contains HTML, this is likely our signature
                    if (/<[^>]+>/.test(afterSplit)) {
                      emailPart = content.substring(0, matches[i]).trim();
                      signaturePart = afterSplit.trim();
                      break;
                    }
                  }

                  // Fallback: if no split found, treat entire content as having both parts mixed
                  if (!signaturePart && hasHTML) {
                    // Just render the entire content as HTML since we can't safely split it
                    return (
                      <div
                        className="prose prose-sm max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_img.signature-image]:max-h-20 [&_img.signature-image]:w-auto"
                        dangerouslySetInnerHTML={{ __html: content }}
                      />
                    );
                  }

                  return (
                    <div>
                      {/* Email content as plain text */}
                      {emailPart && <div className="whitespace-pre-wrap">{emailPart}</div>}

                      {/* Signature as HTML if it contains HTML tags */}
                      {signaturePart && (
                        <div className="mt-4">
                          {/<[^>]+>/.test(signaturePart) ? (
                            <div
                              className="prose prose-sm max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_img.signature-image]:max-h-20 [&_img.signature-image]:w-auto"
                              dangerouslySetInnerHTML={{ __html: signaturePart }}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">{signaturePart}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // Legacy format: Show structured content with references
              contentWithSignature.map((piece, index) => {
                // Check if this is signature content or contains HTML
                const isSignature = piece.references?.includes("signature") || false;
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
                      <ReferencesDisplay references={piece.references} referenceContexts={referenceContexts || {}} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Send Button */}
      {emailId && showSendButton && <EmailSendButton emailId={emailId} donorName={donorName} donorEmail={donorEmail} />}

      {/* Email Tracking Status */}
      {emailId && donorId && <EmailTrackingStatus emailId={emailId} donorId={donorId} sessionId={sessionId} />}

      {/* Email Edit Modal */}
      {isPreviewMode && !emailId ? (
        // Preview mode edit modal
        <PreviewEditModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          donorId={donorId || 0}
          initialSubject={previewSubject}
          initialContent={previewContent}
          donorName={donorName}
          donorEmail={donorEmail}
          onSave={(newSubject, newContent) => {
            setPreviewSubject(newSubject);
            setPreviewContent(newContent);
            if (onPreviewEdit && donorId) {
              onPreviewEdit(donorId, newSubject, newContent);
            }
            setIsEditModalOpen(false);
          }}
        />
      ) : emailId ? (
        <EmailEditModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          emailId={emailId}
          initialSubject={subject}
          initialContent={content || []}
          initialReferenceContexts={referenceContexts || {}}
          donorName={donorName}
          donorEmail={donorEmail}
        />
      ) : null}
    </div>
  );
}
