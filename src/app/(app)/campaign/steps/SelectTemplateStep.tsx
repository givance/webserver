"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useTemplates } from "@/app/hooks/use-templates";
import { useCampaignAutoSave } from "@/app/hooks/use-campaign-auto-save";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

interface SelectTemplateStepProps {
  selectedTemplateId?: number;
  onTemplateSelected: (templateId: number | null, templatePrompt?: string) => void;
  onBack: () => void;
  onNext: () => void;
  // Auto-save props
  sessionId?: number;
  onSessionIdChange?: (sessionId: number) => void;
  campaignName?: string;
  selectedDonorIds?: number[];
}

export function SelectTemplateStep({
  selectedTemplateId,
  onTemplateSelected,
  onBack,
  onNext,
  sessionId,
  onSessionIdChange,
  campaignName,
  selectedDonorIds,
}: SelectTemplateStepProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(selectedTemplateId || null);
  const [selectedTemplatePrompt, setSelectedTemplatePrompt] = useState<string>("");

  // Auto-save hook
  const { autoSave, isSaving } = useCampaignAutoSave({
    onSessionIdChange,
  });

  const { listTemplates } = useTemplates();
  const { data: templates, isLoading, error } = listTemplates({});

  // Auto-save when template selection changes
  useEffect(() => {
    if (campaignName && selectedDonorIds && selectedDonorIds.length > 0) {
      autoSave({
        sessionId,
        campaignName,
        selectedDonorIds,
        templateId: selectedTemplate || undefined,
      });
    }
  }, [selectedTemplate, campaignName, selectedDonorIds, sessionId, autoSave]);

  const handleTemplateChange = (value: string) => {
    if (value === "none") {
      setSelectedTemplate(null);
      setSelectedTemplatePrompt("");
      onTemplateSelected(null);
    } else {
      const templateId = parseInt(value);
      const template = templates?.find((t) => t.id === templateId);
      setSelectedTemplate(templateId);
      setSelectedTemplatePrompt(template?.prompt || "");
      onTemplateSelected(templateId, template?.prompt);
    }
  };

  const handleNext = () => {
    onNext();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Select Template (Optional)</h2>
          <p className="text-muted-foreground">Choose a template to start with, or continue without one.</p>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Select Template (Optional)</h2>
          <p className="text-muted-foreground">Choose a template to start with, or continue without one.</p>
        </div>
        <div className="text-red-500">Error loading templates. You can continue without a template.</div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext}>
            Continue Without Template
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Select Template (Optional)</h2>
        <p className="text-muted-foreground">
          Choose a template to start with, or continue without one to write your own instructions.
        </p>
      </div>

      {templates?.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground mb-4">
                No templates found. You can create templates in Settings to speed up future communications.
              </div>
              <Link href="/settings/templates">
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Templates
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <RadioGroup value={selectedTemplate?.toString() || "none"} onValueChange={handleTemplateChange}>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="none" id="none" />
              <Label htmlFor="none" className="flex-1 cursor-pointer">
                <Card className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">No Template</h3>
                      <p className="text-sm text-muted-foreground">Write your own instructions from scratch</p>
                    </div>
                  </div>
                </Card>
              </Label>
            </div>

            {templates?.map((template) => (
              <div key={template.id} className="flex items-center space-x-2">
                <RadioGroupItem value={template.id.toString()} id={template.id.toString()} />
                <Label htmlFor={template.id.toString()} className="flex-1 cursor-pointer">
                  <Card className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="space-y-1">
                        <h3 className="font-medium">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary">Template</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded max-h-32 overflow-y-auto">
                      {template.prompt}
                    </div>
                  </Card>
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      )}

      {selectedTemplate && selectedTemplatePrompt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selected Template Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={selectedTemplatePrompt} readOnly rows={6} className="bg-muted" />
            <p className="text-sm text-muted-foreground mt-2">
              This template will be used as your starting instruction. You can modify it in the next step.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Auto-save indicator */}
      {campaignName && selectedDonorIds && selectedDonorIds.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check className="h-3 w-3 text-green-600" />
              <span className="text-green-600">Saved</span>
            </>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleNext}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
