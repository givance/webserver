"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Users, Search } from "lucide-react";
import Link from "next/link";
import { useLists } from "@/app/hooks/use-lists";
import { useDonors } from "@/app/hooks/use-donors";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";

// Type for donor selection
type SelectableDonor = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  selected: boolean;
};

export default function AddListPage() {
  const router = useRouter();
  const { createList, addDonorsToList, isCreating, isAddingDonors } = useLists();
  const { listDonors } = useDonors();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDonorIds, setSelectedDonorIds] = useState<number[]>([]);
  const [donorSearchTerm, setDonorSearchTerm] = useState("");
  const [showDonorSelection, setShowDonorSelection] = useState(false);

  // Get donors for selection
  const {
    data: donorsResponse,
    isLoading: isDonorsLoading,
    error: donorsError,
  } = listDonors({
    searchTerm: donorSearchTerm,
    orderBy: "firstName",
    orderDirection: "asc",
  });

  const selectableDonors: SelectableDonor[] = useMemo(() => {
    return (
      donorsResponse?.donors?.map((donor) => ({
        id: donor.id,
        name: formatDonorName(donor),
        email: donor.email,
        phone: donor.phone || null,
        selected: selectedDonorIds.includes(donor.id),
      })) || []
    );
  }, [donorsResponse, selectedDonorIds]);

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
      // Step 1: Create the list
      const newList = await createList({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
      });

      // Step 2: Add selected donors to the list (if any)
      if (selectedDonorIds.length > 0 && newList) {
        await addDonorsToList(newList.id, selectedDonorIds);
      }

      // Navigate to the list detail page or lists page
      if (newList) {
        router.push(`/lists/${newList.id}`);
      } else {
        router.push("/lists");
      }
    } catch (error) {
      console.error("Error creating list:", error);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleDonorToggle = (donorId: number, checked: boolean) => {
    setSelectedDonorIds((prev) => (checked ? [...prev, donorId] : prev.filter((id) => id !== donorId)));
  };

  const handleSelectAllDonors = (checked: boolean) => {
    if (checked) {
      setSelectedDonorIds(selectableDonors.map((d) => d.id));
    } else {
      setSelectedDonorIds([]);
    }
  };

  const isLoading = isCreating || isAddingDonors;

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <Link href="/lists" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Lists
        </Link>
      </div>

      <div className="max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* List Details */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Donor List</CardTitle>
              <CardDescription>
                Create a new list to organize donors for targeted communications and campaigns.
              </CardDescription>
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

                {/* Toggle donor selection */}
                <div className="flex items-center space-x-2 pt-4 border-t">
                  <Switch
                    id="showDonorSelection"
                    checked={showDonorSelection}
                    onCheckedChange={setShowDonorSelection}
                  />
                  <Label htmlFor="showDonorSelection">Add donors now</Label>
                  <p className="text-sm text-muted-foreground">
                    {showDonorSelection ? "Select donors to add to this list" : "Create empty list (add donors later)"}
                  </p>
                </div>

                <div className="flex justify-end space-x-4">
                  <Button type="button" variant="outline" onClick={() => router.push("/lists")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading
                      ? isCreating
                        ? "Creating..."
                        : "Adding donors..."
                      : selectedDonorIds.length > 0
                      ? `Create List with ${selectedDonorIds.length} Donor${selectedDonorIds.length !== 1 ? "s" : ""}`
                      : "Create List"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Donor Selection */}
          {showDonorSelection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Select Donors</span>
                </CardTitle>
                <CardDescription>
                  Choose which donors to include in this list. You can search by name or email.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search donors by name or email..."
                    value={donorSearchTerm}
                    onChange={(e) => setDonorSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Select All */}
                {selectableDonors.length > 0 && (
                  <div className="flex items-center space-x-2 pb-2 border-b">
                    <Checkbox
                      checked={selectedDonorIds.length === selectableDonors.length && selectableDonors.length > 0}
                      onCheckedChange={handleSelectAllDonors}
                    />
                    <Label className="font-medium">
                      Select All ({selectableDonors.length} donor{selectableDonors.length !== 1 ? "s" : ""})
                    </Label>
                  </div>
                )}

                {/* Selected count */}
                {selectedDonorIds.length > 0 && (
                  <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                    {selectedDonorIds.length} donor{selectedDonorIds.length !== 1 ? "s" : ""} selected
                  </div>
                )}

                {/* Donor List */}
                <div className="max-h-96 overflow-auto space-y-2">
                  {isDonorsLoading ? (
                    <LoadingSkeleton />
                  ) : donorsError ? (
                    <ErrorDisplay error={donorsError.message || "Failed to load donors"} title="Error loading donors" />
                  ) : selectableDonors.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {donorSearchTerm ? "No donors found matching your search" : "No donors available"}
                    </div>
                  ) : (
                    selectableDonors.map((donor) => (
                      <div
                        key={donor.id}
                        className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={donor.selected}
                          onCheckedChange={(checked) => handleDonorToggle(donor.id, !!checked)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{donor.name}</div>
                          <div className="text-sm text-muted-foreground">{donor.email}</div>
                          {donor.phone && <div className="text-sm text-muted-foreground">{donor.phone}</div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
