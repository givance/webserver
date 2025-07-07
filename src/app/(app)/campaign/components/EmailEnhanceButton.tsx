'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCommunications } from '@/app/hooks/use-communications';

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface EmailEnhanceButtonProps {
  emailId: number;
  sessionId?: number;
  currentSubject: string;
  currentContent: EmailPiece[];
  currentReferenceContexts: Record<string, string>;
  onEnhanced?: (newSubject: string, newContent: EmailPiece[]) => void;
  // Preview mode props
  isPreviewMode?: boolean;
  onPreviewEnhance?: (instruction: string) => void;
}

export function EmailEnhanceButton({
  emailId,
  sessionId,
  currentSubject,
  currentContent,
  currentReferenceContexts,
  onEnhanced,
  isPreviewMode = false,
  onPreviewEnhance,
}: EmailEnhanceButtonProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const { smartEmailGeneration, getSession } = useCommunications();
  const [isLoading, setIsLoading] = useState(false);

  const handleEnhance = async () => {
    if (!instruction.trim()) {
      toast.error('Please enter enhancement instructions');
      return;
    }

    try {
      setIsLoading(true);

      if (isPreviewMode && onPreviewEnhance) {
        // Preview mode: Use the callback provided by the parent
        onPreviewEnhance(instruction);
        toast.success('Enhancement instruction noted!');
        setInstruction('');
        setOpen(false);
      } else if (!isPreviewMode && sessionId) {
        // Normal mode: Use smartEmailGeneration with generate_with_new_message mode
        const result = await smartEmailGeneration.mutateAsync({
          sessionId,
          mode: 'generate_with_new_message',
          newMessage: instruction,
        });

        if (result.success) {
          toast.success('Email enhanced successfully!');
          setInstruction('');
          setOpen(false);
        } else {
          toast.error('Failed to enhance email');
        }
      } else {
        toast.error('Enhancement not available in this mode');
      }
    } catch (error) {
      console.error('Error enhancing email:', error);
      toast.error('Failed to enhance email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-7 text-xs px-2"
      >
        <Sparkles className="h-3 w-3" />
        Enhance
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Email Enhancement</DialogTitle>
            <DialogDescription>
              Describe how you&apos;d like to enhance this email. The AI will modify it while
              preserving the core message.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="instruction">Enhancement Instruction</Label>
                <Input
                  id="instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Add a warm greeting, make it more personal, mention their last donation..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEnhance();
                    }
                  }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Examples: &quot;Add one line of greeting&quot;, &quot;Make the tone more
                  friendly&quot;, &quot;Include a personal touch&quot;
                </p>
              </div>

              {/* Current Email Preview */}
              <div className="space-y-2">
                <Label>Current Email Content</Label>
                <div className="border rounded-lg p-3 bg-muted/20 max-h-[400px] overflow-y-auto">
                  <div className="text-sm font-medium mb-2">Subject: {currentSubject}</div>
                  <div className="space-y-2 text-sm font-sans">
                    {currentContent.map((piece, index) => {
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEnhance}
              disabled={smartEmailGeneration.isPending || !instruction.trim()}
            >
              {smartEmailGeneration.isPending ? 'Enhancing...' : 'Enhance Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
