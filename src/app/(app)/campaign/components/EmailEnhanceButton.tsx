"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCommunications } from "@/app/hooks/use-communications";

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface EmailEnhanceButtonProps {
  emailId: number;
  currentSubject: string;
  currentContent: EmailPiece[];
  currentReferenceContexts: Record<string, string>;
  onEnhanced?: (newSubject: string, newContent: EmailPiece[]) => void;
}

export function EmailEnhanceButton({
  emailId,
  currentSubject,
  currentContent,
  currentReferenceContexts,
  onEnhanced,
}: EmailEnhanceButtonProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const { enhanceEmail } = useCommunications();

  const handleEnhance = async () => {
    if (!instruction.trim()) {
      toast.error("Please enter an enhancement instruction");
      return;
    }

    try {
      const result = await enhanceEmail.mutateAsync({
        emailId,
        enhancementInstruction: instruction,
        currentSubject,
        currentStructuredContent: currentContent,
        currentReferenceContexts,
      });

      toast.success("Email enhanced successfully!");
      
      // Notify parent component of the changes
      if (onEnhanced && result.subject && result.structuredContent) {
        onEnhanced(result.subject, result.structuredContent);
      }
      
      // Close dialog and reset
      setOpen(false);
      setInstruction("");
    } catch (error) {
      toast.error("Failed to enhance email with AI");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" />
        AI Enhance
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>AI Email Enhancement</DialogTitle>
            <DialogDescription>
              Describe how you&apos;d like to enhance this email. The AI will modify it while preserving the core message.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instruction">Enhancement Instruction</Label>
              <Input
                id="instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g., Add a warm greeting, make it more personal, mention their last donation..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleEnhance();
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Examples: &quot;Add one line of greeting&quot;, &quot;Make the tone more friendly&quot;, &quot;Include a personal touch&quot;
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEnhance} 
              disabled={enhanceEmail.isPending || !instruction.trim()}
            >
              {enhanceEmail.isPending ? "Enhancing..." : "Enhance Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}