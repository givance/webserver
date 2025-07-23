'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useTemplates } from '@/app/hooks/use-templates';
import { useCampaignAutoSave } from '@/app/hooks/use-campaign-auto-save';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignData, useSessionData, useDonorData } from '../store/hooks';

interface SelectTemplateStepProps {
  onBack: () => void;
  onNext: () => void;
}

export function SelectTemplateStep({ onBack, onNext }: SelectTemplateStepProps) {
  // Get state and actions from store
  const { templateId, templatePrompt, setTemplate } = useCampaignData();
  const { sessionId, setSessionId, isSaving } = useSessionData();
  const { selectedDonors } = useDonorData();
  const { campaignName } = useCampaignData();

  // Auto-save hook
  const { autoSave } = useCampaignAutoSave({
    onSessionIdChange: setSessionId,
  });

  const { listTemplates } = useTemplates();
  const { data: templates, isLoading, error } = listTemplates({});

  // Auto-save when template selection changes
  useEffect(() => {
    if (campaignName && selectedDonors && selectedDonors.length > 0) {
      autoSave({
        sessionId,
        campaignName,
        selectedDonorIds: selectedDonors,
        templateId: templateId || undefined,
      });
    }
  }, [templateId, campaignName, selectedDonors, sessionId, autoSave]);

  const handleTemplateChange = (value: string) => {
    if (value === 'none') {
      setTemplate(undefined, '');
    } else {
      const newTemplateId = parseInt(value);
      const template = templates?.find((t) => t.id === newTemplateId);
      setTemplate(newTemplateId, template?.prompt || '');
    }
  };

  const handleNext = () => {
    onNext();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full space-y-3">
        {/* Compact Navigation Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onBack} size="sm" className="h-7 text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" />
              Back
            </Button>
            <h2 className="text-sm font-medium text-muted-foreground">
              Select Template (Optional)
            </h2>
          </div>
          <Button onClick={handleNext} size="sm" className="h-7 text-xs" disabled>
            Continue
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
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
      <div className="flex flex-col h-full space-y-3">
        {/* Compact Navigation Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onBack} size="sm" className="h-7 text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" />
              Back
            </Button>
            <h2 className="text-sm font-medium text-muted-foreground">
              Select Template (Optional)
            </h2>
          </div>
          <Button onClick={handleNext} size="sm" className="h-7 text-xs">
            Continue Without Template
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="p-4 border rounded-lg bg-destructive/10 text-destructive">
          Error loading templates. You can continue without a template.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Compact Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} size="sm" className="h-7 text-xs">
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
          <h2 className="text-sm font-medium text-muted-foreground">Select Template (Optional)</h2>
        </div>
        <Button onClick={handleNext} size="sm" className="h-7 text-xs">
          Continue
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {templates?.length === 0 ? (
        <div className="border rounded-lg p-6 text-center bg-card">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground mb-3">
            No templates found. You can create templates in Settings to speed up future
            communications.
          </div>
          <Link href="/settings/templates">
            <Button variant="outline" size="sm">
              <Plus className="w-3 h-3 mr-2" />
              Create Templates
            </Button>
          </Link>
        </div>
      ) : (
        <RadioGroup value={templateId?.toString() || 'none'} onValueChange={handleTemplateChange}>
          <div className="grid gap-3">
            <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
              <RadioGroupItem value="none" id="none" />
              <Label htmlFor="none" className="flex-1 cursor-pointer">
                <div className="space-y-1">
                  <h3 className="font-medium">No Template</h3>
                  <p className="text-sm text-muted-foreground">
                    Write your own instructions from scratch
                  </p>
                </div>
              </Label>
            </div>

            {templates?.map((template) => (
              <div
                key={template.id}
                className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <RadioGroupItem value={template.id.toString()} id={template.id.toString()} />
                <Label htmlFor={template.id.toString()} className="flex-1 cursor-pointer">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-medium">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Template
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md max-h-24 overflow-y-auto">
                      {template.prompt}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      )}

      {/* Auto-save indicator */}
      {campaignName && selectedDonors && selectedDonors.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
    </div>
  );
}
