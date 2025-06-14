"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLists } from "@/app/hooks/use-lists";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { toast } from "sonner";

export default function EditListPage() {
  const params = useParams();
  const router = useRouter();
  const listId = Number(params.id);

  const { getDonorListQuery, updateList, isUpdating } = useLists();
  const { data: list, isLoading, error } = getDonorListQuery(listId);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when list loads
  useEffect(() => {
    if (list) {
      setFormData({
        name: list.name,
        description: list.description || "",
        isActive: list.isActive,
      });
    }
  }, [list]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "List name is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await updateList({
        id: listId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
      });

      router.push(`/lists/${listId}`);
    } catch (error) {
      console.error("Error updating list:", error);
      toast.error("Failed to update list. Please try again.");
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !list) {
    return <ErrorDisplay error={error?.message || "List not found"} title="Error loading list" />;
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 mb-6">
        <Link href="/lists" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href="/lists" className="text-muted-foreground hover:text-foreground">
          Lists
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`/lists/${listId}`} className="text-muted-foreground hover:text-foreground">
          {list.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Edit</span>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Edit Donor List</CardTitle>
            <CardDescription>Update the details of &quot;{list.name}&quot; list.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">List Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter list name..."
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Enter description (optional)..."
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  Optional description to help identify the purpose of this list.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => handleInputChange("isActive", checked)}
                />
                <Label htmlFor="isActive">Active</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive ? "This list is active and can be used" : "This list is inactive"}
                </p>
              </div>

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={() => router.push(`/lists/${listId}`)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Updating..." : "Update List"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
