"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface EmailEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: number;
  initialSubject: string;
  initialContent: EmailPiece[];
  initialReferenceContexts: Record<string, string>;
  donorName: string;
  donorEmail: string;
}

export function EmailEditModal({
  open,
  onOpenChange,
  emailId,
  initialSubject,
  initialContent,
  initialReferenceContexts,
  donorName,
  donorEmail,
}: EmailEditModalProps) {
  const { updateEmail } = useCommunications();
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState("");
  const [referenceContexts, setReferenceContexts] = useState(initialReferenceContexts);
  const [showPreview, setShowPreview] = useState(false);
  const [signaturePieces, setSignaturePieces] = useState<EmailPiece[]>([]);

  // Convert structured content to plain text (excluding signatures)
  const structuredToPlainText = (structuredContent: EmailPiece[]): string => {
    // Filter out signature pieces
    const contentWithoutSignature = structuredContent.filter(
      (piece) => !piece.references.includes("signature")
    );
    
    // Store signature pieces separately
    const sigs = structuredContent.filter(
      (piece) => piece.references.includes("signature")
    );
    setSignaturePieces(sigs);
    
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

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setContent(structuredToPlainText(initialContent));
      setReferenceContexts(initialReferenceContexts);
      setShowPreview(false);
    }
  }, [open, initialSubject, initialContent, initialReferenceContexts]);

  const handleSave = async () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }

    if (!content.trim()) {
      toast.error("Email content is required");
      return;
    }

    let structuredContent = plainTextToStructured(content);
    
    // Re-append signature pieces at the end
    if (signaturePieces.length > 0) {
      structuredContent = [...structuredContent, ...signaturePieces];
    }
    
    try {
      await updateEmail.mutateAsync({
        emailId,
        subject,
        structuredContent,
        referenceContexts,
      });
      toast.success("Email updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to update email.");
    }
  };

  const renderPreview = () => {
    let previewStructured = plainTextToStructured(content);
    
    // Re-append signature pieces for preview
    if (signaturePieces.length > 0) {
      previewStructured = [...previewStructured, ...signaturePieces];
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              To: {donorName} ({donorEmail})
            </CardTitle>
            <div className="text-sm font-medium mt-2">Subject: {subject}</div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm font-sans">
              {previewStructured.map((piece, index) => {
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
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Email</DialogTitle>
          <DialogDescription>
            Edit the email content and subject for {donorName} ({donorEmail})
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="flex gap-2 mb-4">
            <Button variant={!showPreview ? "default" : "outline"} size="sm" onClick={() => setShowPreview(false)}>
              Edit
            </Button>
            <Button variant={showPreview ? "default" : "outline"} size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          </div>

          {showPreview ? (
            <ScrollArea className="h-[500px]">{renderPreview()}</ScrollArea>
          ) : (
            <div className="space-y-4 h-[500px] flex flex-col">
              {/* Subject Field */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  maxLength={200}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground">{subject.length}/200 characters</div>
              </div>

              {/* Content Field */}
              <div className="space-y-2 flex-1 flex flex-col">
                <Label htmlFor="content">Email Content</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter email content... Use double line breaks to create paragraphs."
                  className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto resize-none w-full"
                />
                <div className="text-xs text-muted-foreground">
                  Tip: Use double line breaks (press Enter twice) to create separate paragraphs
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateEmail.isPending}>
            {updateEmail.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
