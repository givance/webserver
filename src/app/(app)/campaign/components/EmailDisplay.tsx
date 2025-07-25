import { useCommunications } from '@/app/hooks/use-communications';
import { trpc } from '@/app/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Check, Clock, Edit, HelpCircle, Info, Send } from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DonorTooltip } from './DonorTooltip';
import { EmailEditModal } from './EmailEditModal';
import { EmailEnhanceButton } from './EmailEnhanceButton';
import { EmailSendButton } from './EmailSendButton';
import { EmailTrackingStatus } from './EmailTrackingStatus';

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
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED';
  onStatusChange?: (emailId: number, status: 'PENDING_APPROVAL' | 'APPROVED') => void;
  isUpdatingStatus?: boolean;
  // Preview mode props
  isPreviewMode?: boolean; // When true, enables edit/enhance without emailId
  onPreviewEdit?: (donorId: number, subject: string, content: EmailPiece[]) => void;
  onPreviewEnhance?: (donorId: number, instruction: string) => void;
  onPreviewStatusChange?: (donorId: number, status: 'PENDING_APPROVAL' | 'APPROVED') => void;
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
  const [content, setContent] = useState('');

  // Convert structured content to plain text (excluding signatures)
  const structuredToPlainText = (structuredContent: EmailPiece[]): string => {
    // Remove signature pieces
    const contentWithoutSignature = structuredContent.filter(
      (piece) => !piece.references?.includes('signature')
    );

    return contentWithoutSignature
      .map((piece) => piece.piece + (piece.addNewlineAfter ? '\n\n' : ''))
      .join('')
      .trim();
  };

  // Convert plain text to structured content
  const plainTextToStructured = (text: string): EmailPiece[] => {
    if (!text.trim()) {
      return [{ piece: '', references: [], addNewlineAfter: false }];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // Only depend on open to prevent infinite loops from object dependencies

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
              <p className="text-xs text-muted-foreground flex-shrink-0">
                Use double line breaks to create paragraphs
              </p>
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

export const EmailDisplay = React.memo(function EmailDisplay({
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
  approvalStatus = 'PENDING_APPROVAL',
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

  const { getEmailStatus, sendBulkEmails, isLoadingSendBulkEmails } = useCommunications();

  // Determine which format to use - memoized to prevent re-computations
  const isNewFormat = useMemo(() => {
    return emailContent !== undefined && emailContent !== null && emailContent.trim().length > 0;
  }, [emailContent]);

  const isLegacyFormat = useMemo(() => {
    return content !== undefined && content.length > 0;
  }, [content]);

  // Get email status to check if sent - only query if emailId exists
  const { data: emailStatus, error: statusError } = getEmailStatus(
    { emailId: emailId || 0 },
    {
      enabled: !!emailId && emailId > 0,
      retry: false, // Don't retry if email not found (e.g., after regeneration)
      staleTime: 0, // Always fetch fresh data
      refetchOnMount: false, // Don't refetch on mount if data exists
    }
  );

  // Convert new format (type/content) to legacy format (piece/references/addNewlineAfter)
  const convertToLegacyFormat = useCallback((content: any[]): EmailPiece[] => {
    return content.map((item) => {
      // If it's already in legacy format, return as-is
      if (
        item.piece !== undefined &&
        item.references !== undefined &&
        item.addNewlineAfter !== undefined
      ) {
        return item as EmailPiece;
      }

      // If it's in new format, convert it
      if (item.type && item.content) {
        return {
          piece: item.content,
          references: [], // New format doesn't have references
          addNewlineAfter: true, // Default to true for paragraph breaks
        };
      }

      // Fallback for malformed data
      return {
        piece: typeof item === 'string' ? item : JSON.stringify(item),
        references: [],
        addNewlineAfter: true,
      };
    });
  }, []);

  // For legacy format, we may need to fetch signature separately - memoized to prevent query refetches
  const displayContent = useMemo(() => {
    return isPreviewMode ? previewContent : content || [];
  }, [isPreviewMode, previewContent, content]);

  const legacyFormatContent = useMemo(() => {
    return convertToLegacyFormat(displayContent);
  }, [convertToLegacyFormat, displayContent]);

  const { data: signatureData } = trpc.emailCampaigns.getEmailWithSignature.useQuery(
    {
      donorId: donorId || 0,
      structuredContent: legacyFormatContent,
    },
    {
      enabled:
        !!donorId && displayContent.length > 0 && isLegacyFormat && !isNewFormat && !isPreviewMode,
      staleTime: 10 * 60 * 1000, // Cache for 10 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
      refetchOnWindowFocus: false, // Prevent refetch on focus to reduce calls
      refetchOnMount: false, // Prevent refetch on mount if data exists
    }
  );

  // For new format, fetch plain text email content with signature
  const { data: plainTextSignatureData } =
    trpc.emailCampaigns.getPlainTextEmailWithSignature.useQuery(
      {
        emailId: emailId || 0,
      },
      {
        enabled: !!emailId && isNewFormat && !isPreviewMode,
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
        refetchOnWindowFocus: false, // Prevent refetch on focus to reduce calls
        refetchOnMount: false, // Prevent refetch on mount if data exists
      }
    );

  // Use signature-appended content for legacy format when available, otherwise use converted content
  const contentWithSignature =
    signatureData && isLegacyFormat && !isNewFormat
      ? signatureData.structuredContent
      : legacyFormatContent;

  // Use signature-appended content for new format when available
  const emailContentWithSignature =
    plainTextSignatureData && isNewFormat ? plainTextSignatureData.emailContent : emailContent;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <CardHeader className="pb-2 px-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="space-y-1">
                <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-medium">To:</span>
                  {donorId ? (
                    <TooltipProvider>
                      <DonorTooltip
                        donorId={donorId}
                        donorName={donorName}
                        side="bottom"
                        align="start"
                      >
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/donors/${donorId}`}
                            className="text-xs text-primary hover:underline font-medium"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {donorName}
                          </Link>
                          <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60 cursor-help" />
                        </div>
                      </DonorTooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="font-medium">{donorName}</span>
                  )}
                  <span className="font-normal text-muted-foreground text-xs">({donorEmail})</span>
                </div>
                {staffName && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="font-medium">Assigned to:</span>
                    <span>{staffName}</span>
                    {hasLinkedEmail && staffEmail ? (
                      <span className="text-xs">({staffEmail})</span>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="destructive"
                              className="text-xs px-1.5 py-0 h-5 cursor-help"
                            >
                              <AlertCircle className="h-3 w-3 mr-1" />
                              No linked email
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>This staff member doesn&apos;t have a linked email account.</p>
                            <p className="mt-1">
                              Emails will be sent from:{' '}
                              <span className="font-medium">
                                {defaultStaffEmail || 'the default organization email'}
                              </span>
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
              </div>
              <div className="text-xs font-medium mt-1.5">
                <span className="text-muted-foreground">Subject:</span>{' '}
                {isPreviewMode ? previewSubject : subject}
              </div>
            </div>
            {((emailId && !emailStatus?.isSent) || isPreviewMode) && showEditButton && (
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {((onStatusChange && emailId) ||
                  (isPreviewMode && onPreviewStatusChange && donorId)) &&
                  !emailStatus?.isSent && (
                    <Button
                      variant={approvalStatus === 'APPROVED' ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => {
                        if (isPreviewMode && onPreviewStatusChange && donorId) {
                          onPreviewStatusChange(
                            donorId,
                            approvalStatus === 'APPROVED' ? 'PENDING_APPROVAL' : 'APPROVED'
                          );
                        } else if (onStatusChange && emailId) {
                          onStatusChange(
                            emailId,
                            approvalStatus === 'APPROVED' ? 'PENDING_APPROVAL' : 'APPROVED'
                          );
                        }
                      }}
                      disabled={isUpdatingStatus}
                      className="flex items-center gap-1.5 h-7 text-xs px-2"
                    >
                      {isUpdatingStatus ? (
                        'Updating...'
                      ) : approvalStatus === 'APPROVED' ? (
                        <>
                          <Clock className="h-3 w-3" />
                          Unapprove
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" />
                          Approve
                        </>
                      )}
                    </Button>
                  )}
                {emailId && showSendButton && !emailStatus?.isSent && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      try {
                        console.log('Sending email to', donorName);
                        const result = await sendBulkEmails({
                          sessionId: sessionId || 0,
                          emailIds: [emailId],
                        });
                        if (result.failed.length > 0) {
                          toast.error(
                            `Failed to send email to ${donorName}: ${result.failed[0].error}`
                          );
                        } else {
                          toast.success(`Email sent successfully to ${donorName}`);
                        }
                      } catch (error) {
                        console.error('Error sending email:', error);
                        const errorMessage =
                          error instanceof Error ? error.message : 'Unknown error occurred';
                        toast.error(`Failed to send email to ${donorName}: ${errorMessage}`);
                      }
                    }}
                    disabled={isLoadingSendBulkEmails}
                    className="flex items-center gap-1.5 h-7 text-xs px-2"
                  >
                    {isLoadingSendBulkEmails ? (
                      <>
                        <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3" />
                        Send
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
                  className="flex items-center gap-1.5 h-7 text-xs px-2"
                >
                  <Edit className="h-3 w-3" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="space-y-2 text-sm font-sans">
            {isNewFormat ? (
              // New format: Show plain email content without references
              <div>
                {/* Show reasoning for new format emails */}
                {reasoning && (
                  <div className="mt-1.5 p-2 bg-muted/30 rounded-md border">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Info className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground">
                        AI Generation Strategy
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-light leading-relaxed">
                      {reasoning}
                    </p>
                  </div>
                )}

                {/* Handle email content with potential HTML signature */}
                {(() => {
                  const content = emailContentWithSignature || emailContent || '';

                  // Check if content contains HTML (likely from signature)
                  const hasHTML = /<[^>]+>/.test(content);

                  if (!hasHTML) {
                    // No HTML, render as plain text
                    return <div className="whitespace-pre-wrap">{content}</div>;
                  }

                  // Content has HTML, try to split email content from signature
                  // Look for the last double newline before HTML content
                  let emailPart = content;
                  let signaturePart = '';

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
                const isSignature = piece.references?.includes('signature') || false;
                const containsHTML = /<[^>]+>/.test(piece.piece);
                const shouldRenderHTML = isSignature || containsHTML;

                return (
                  <div key={index} className={piece.addNewlineAfter ? 'mb-4' : ''}>
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
                      <ReferencesDisplay
                        references={piece.references}
                        referenceContexts={referenceContexts || {}}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Send Button */}
      {emailId && showSendButton && (
        <EmailSendButton emailId={emailId} donorName={donorName} donorEmail={donorEmail} />
      )}

      {/* Email Tracking Status */}
      {emailId && donorId && (
        <EmailTrackingStatus emailId={emailId} donorId={donorId} sessionId={sessionId} />
      )}

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
          initialContent={isNewFormat ? undefined : content || []}
          initialReferenceContexts={isNewFormat ? undefined : referenceContexts || {}}
          initialEmailContent={isNewFormat ? emailContent : undefined}
          initialReasoning={isNewFormat ? reasoning : undefined}
          donorName={donorName}
          donorEmail={donorEmail}
        />
      ) : null}
    </div>
  );
});
