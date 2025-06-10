"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization } from "@/app/hooks/use-organization";
import toast from "react-hot-toast";
import { Loader2, Pencil, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";

// Define a type for form data that excludes memory
type FormData = {
  websiteUrl?: string;
  websiteSummary?: string;
  description?: string;
  shortDescription?: string;
  writingInstructions?: string;
};

export function OrganizationSettings() {
  const { getOrganization, updateOrganization, isUpdating, generateShortDescription } = useOrganization();
  const { data: organization, isLoading, error } = getOrganization();
  const [formData, setFormData] = useState<FormData>({});
  const [isSummaryEditing, setIsSummaryEditing] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isGeneratingShortDescription, setIsGeneratingShortDescription] = useState(false);

  // Update form data when organization data is loaded
  useEffect(() => {
    if (organization) {
      setFormData({
        websiteUrl: organization.websiteUrl || "",
        websiteSummary: organization.websiteSummary || "",
        description: organization.description || "",
        shortDescription: organization.shortDescription || "",
        writingInstructions: organization.writingInstructions || "",
      });
    }
  }, [organization]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only include fields that have been changed
    const changedData: FormData = {};
    Object.entries(formData).forEach(([key, value]) => {
      const k = key as keyof FormData;
      const orgValue = organization?.[k as keyof typeof organization];

      // Only include if value is different from original
      if (value !== orgValue) {
        changedData[k] = value;
      }
    });

    if (Object.keys(changedData).length === 0) {
      toast("No changes were made to the organization settings.", {
        icon: "ℹ️",
      });
      return;
    }

    const result = await updateOrganization(changedData);

    if (result) {
      toast.success("Your organization settings have been updated successfully.");
    } else {
      toast.error("Failed to update organization settings. Please try again.");
    }
  };

  const handleGenerateShortDescription = async () => {
    setIsGeneratingShortDescription(true);
    try {
      const generatedDescription = await generateShortDescription();
      setFormData((prev) => ({ ...prev, shortDescription: generatedDescription }));
    } catch (error) {
      // Error is already handled in the hook
    } finally {
      setIsGeneratingShortDescription(false);
    }
  };

  if (error) {
    return <div className="text-red-500">Error loading organization: {error.message}</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const truncateSummary = (summary: string) => {
    const maxLength = 200;
    if (summary.length <= maxLength) return summary;
    return summary.slice(0, maxLength) + "...";
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Website & Description</CardTitle>
            <CardDescription>Information about your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="websiteUrl">Website URL</label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  value={formData.websiteUrl || ""}
                  onChange={handleChange}
                  placeholder="https://example.org"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="websiteSummary">Website Summary</label>
                {isSummaryEditing ? (
                  <Textarea
                    id="websiteSummary"
                    name="websiteSummary"
                    value={formData.websiteSummary || ""}
                    onChange={handleChange}
                    placeholder="A brief summary of your website"
                    rows={3}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="prose dark:prose-invert p-3 border rounded-md min-h-[78px]">
                      {formData.websiteSummary ? (
                        <ReactMarkdown>
                          {isSummaryExpanded ? formData.websiteSummary : truncateSummary(formData.websiteSummary)}
                        </ReactMarkdown>
                      ) : (
                        <p className="text-sm text-muted-foreground">No summary provided.</p>
                      )}
                    </div>
                    {formData.websiteSummary && formData.websiteSummary.length > 200 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                        className="w-fit"
                        type="button"
                      >
                        {isSummaryExpanded ? (
                          <>
                            <ChevronUp className="mr-2 h-4 w-4" />
                            Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Show More
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSummaryEditing(!isSummaryEditing)}
                  className="mt-2 w-fit"
                  type="button"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {isSummaryEditing ? "Done Editing" : "Edit Summary"}
                </Button>
              </div>

              <div className="grid gap-2">
                <label htmlFor="description">Organization Description</label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description || ""}
                  onChange={handleChange}
                  placeholder="Describe your organization"
                  rows={4}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="shortDescription">Short Description</label>
                <Textarea
                  id="shortDescription"
                  name="shortDescription"
                  value={formData.shortDescription || ""}
                  onChange={handleChange}
                  placeholder="A brief description of your organization"
                  rows={2}
                />
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    One paragraph description suitable for marketing materials and donor communications
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateShortDescription}
                    disabled={isGeneratingShortDescription || isUpdating}
                    type="button"
                  >
                    {isGeneratingShortDescription ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <label htmlFor="writingInstructions">Writing Instructions</label>
                <Textarea
                  id="writingInstructions"
                  name="writingInstructions"
                  value={formData.writingInstructions || ""}
                  onChange={handleChange}
                  placeholder="Instructions for writing content for your organization"
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  These instructions will guide AI-assisted content creation for your organization
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
