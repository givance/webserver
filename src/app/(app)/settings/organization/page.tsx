"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization, UpdateOrganizationInput } from "@/app/hooks/use-organization";
import toast from "react-hot-toast";
import { Loader2, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";

export default function OrganizationSettingsPage() {
  const { getOrganization, updateOrganization, isUpdating } = useOrganization();
  const { data: organization, isLoading, error } = getOrganization();
  const [formData, setFormData] = useState<UpdateOrganizationInput>({});
  const [isSummaryEditing, setIsSummaryEditing] = useState(false);

  // Update form data when organization data is loaded
  useEffect(() => {
    if (organization) {
      setFormData({
        websiteUrl: organization.websiteUrl || "",
        websiteSummary: organization.websiteSummary || "",
        description: organization.description || "",
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
    const changedData: UpdateOrganizationInput = {};
    Object.entries(formData).forEach(([key, value]) => {
      const k = key as keyof UpdateOrganizationInput;
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

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading organization: {error.message}</div>
      </div>
    );
  }

  return (
    <>
      <title>Organization Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Organization Settings</h1>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
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
                      <div className="prose dark:prose-invert p-3 border rounded-md min-h-[78px]">
                        {formData.websiteSummary ? (
                          <ReactMarkdown>{formData.websiteSummary}</ReactMarkdown>
                        ) : (
                          <p className="text-sm text-muted-foreground">No summary provided.</p>
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
        )}
      </div>
    </>
  );
}
