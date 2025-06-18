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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useLists } from "@/app/hooks/use-lists";
import { useDonors } from "@/app/hooks/use-donors";
import { useStaffMembers } from "@/app/hooks/use-staff-members";
import { trpc } from "@/app/lib/trpc/client";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { toast } from "sonner";

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
  const { createList, addDonorsToList, uploadFilesToList, isCreating, isAddingDonors, isUploadingFiles } = useLists();
  const { listDonors, bulkUpdateDonorStaff } = useDonors();
  const { staffMembers, isLoading: isLoadingStaff } = useStaffMembers();
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDonorIds, setSelectedDonorIds] = useState<number[]>([]);
  const [donorSearchTerm, setDonorSearchTerm] = useState("");
  const [showDonorSelection, setShowDonorSelection] = useState(false);

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");

  // File upload state
  const [donorMethod, setDonorMethod] = useState<"none" | "select" | "upload">("none");
  const [accountsFile, setAccountsFile] = useState<File | null>(null);
  const [pledgesFile, setPledgesFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

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

  // Helper function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:application/... prefix to get just the base64 content
        const base64Content = result.split(",")[1];
        resolve(base64Content);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "List name is required";
    }

    // Validate donor method specific requirements
    if (donorMethod === "upload") {
      if (!accountsFile) {
        newErrors.accountsFile = "Account list CSV file is required";
      }
    }

    // No validation needed for staff assignment since it's optional

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

      if (!newList) {
        throw new Error("Failed to create list");
      }

      let donorIdsToAssignStaff: number[] = [];

      // Step 2: Handle donor addition based on method
      if (donorMethod === "select" && selectedDonorIds.length > 0) {
        await addDonorsToList(newList.id, selectedDonorIds);
        donorIdsToAssignStaff = selectedDonorIds;
      } else if (donorMethod === "upload" && accountsFile) {
        // Convert files to base64
        const accountsContent = await fileToBase64(accountsFile);
        const pledgesContent = pledgesFile ? await fileToBase64(pledgesFile) : null;

        // Upload and process files
        const result = await uploadFilesToList({
          listId: newList.id,
          accountsFile: {
            name: accountsFile.name,
            content: accountsContent,
          },
          pledgesFile:
            pledgesContent && pledgesFile
              ? {
                  name: pledgesFile.name,
                  content: pledgesContent,
                }
              : undefined,
        });

        setUploadResult(result);

        // For uploaded donors, we need to get the donor IDs from the list
        // We'll assign staff after the upload is complete
        // Note: This requires the list to be populated first, so we handle it below
      }

      // Step 3: Assign staff to donors if requested
      if (selectedStaffId && selectedStaffId !== "none") {
        if (donorMethod === "upload") {
          // For uploaded files, we need to get the donor IDs from the newly created list
          // Get donor IDs from the list after successful upload
          try {
            const donorIds = await utils.lists.getDonorIdsFromLists.fetch({ listIds: [newList.id] });
            if (donorIds && donorIds.length > 0) {
              await bulkUpdateDonorStaff(donorIds, parseInt(selectedStaffId, 10));
              toast.success(
                `Successfully assigned staff to ${donorIds.length} imported donor${donorIds.length !== 1 ? "s" : ""}!`
              );
            } else {
              toast.warning("List created successfully, but no donors found to assign staff to.");
            }
          } catch (error) {
            console.error("Error assigning staff to uploaded donors:", error);
            toast.error(
              "List created successfully, but failed to assign staff. You can assign staff manually from the list details page."
            );
          }
        } else if (donorIdsToAssignStaff.length > 0) {
          // Assign staff to selected donors
          await bulkUpdateDonorStaff(donorIdsToAssignStaff, parseInt(selectedStaffId, 10));
          toast.success(
            `Assigned staff to ${donorIdsToAssignStaff.length} donor${donorIdsToAssignStaff.length !== 1 ? "s" : ""}!`
          );
        }
      }

      // Navigate to the list detail page
      router.push(`/lists/${newList.id}`);
    } catch (error) {
      console.error("Error creating list:", error);
      toast.error("Failed to create list. Please try again.");
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

  const handleFileChange = (type: "accounts" | "pledges", file: File | null) => {
    if (type === "accounts") {
      setAccountsFile(file);
      // Clear error when file is selected
      if (file && errors.accountsFile) {
        setErrors((prev) => ({ ...prev, accountsFile: "" }));
      }
    } else {
      setPledgesFile(file);
    }
  };

  const handleDonorMethodChange = (method: "none" | "select" | "upload") => {
    setDonorMethod(method);
    setShowDonorSelection(method === "select");

    // Clear relevant state when switching methods
    if (method !== "select") {
      setSelectedDonorIds([]);
    }
    if (method !== "upload") {
      setAccountsFile(null);
      setPledgesFile(null);
    }
  };

  const handleStaffChange = (staffId: string) => {
    setSelectedStaffId(staffId);
    // Clear error when staff is selected
    if (staffId && errors.staffId) {
      setErrors((prev) => ({ ...prev, staffId: "" }));
    }
  };

  const isLoading = isCreating || isAddingDonors || isUploadingFiles;

  return (
    <div className="container mx-auto px-6 py-6">
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

                {/* Donor Method Selection */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-medium">Add Donors to List</Label>
                  <RadioGroup value={donorMethod} onValueChange={handleDonorMethodChange}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="none" id="method-none" />
                      <Label htmlFor="method-none">Create empty list (add donors later)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="select" id="method-select" />
                      <Label htmlFor="method-select">Select from existing donors</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="upload" id="method-upload" />
                      <Label htmlFor="method-upload">Upload CSV files</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Staff Assignment Section */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="staffSelect">Assign to Staff Member (Optional)</Label>
                    {isLoadingStaff ? (
                      <div className="h-10 bg-muted rounded animate-pulse" />
                    ) : (
                      <Select value={selectedStaffId} onValueChange={handleStaffChange}>
                        <SelectTrigger className={errors.staffId ? "border-red-500" : ""}>
                          <SelectValue placeholder="Select a staff member (optional)..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No assignment</SelectItem>
                          {staffMembers.map((staff) => (
                            <SelectItem key={staff.id} value={staff.id}>
                              {staff.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {errors.staffId && <p className="text-sm text-red-500">{errors.staffId}</p>}
                    <p className="text-sm text-muted-foreground">
                      Choose a staff member to assign all donors in this list to them automatically.
                    </p>
                  </div>
                </div>

                {/* File Upload Section */}
                {donorMethod === "upload" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                    <div className="space-y-2">
                      <Label htmlFor="accountsFile" className="flex items-center space-x-2">
                        <Upload className="w-4 h-4" />
                        <span>Account List CSV *</span>
                      </Label>
                      <Input
                        id="accountsFile"
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileChange("accounts", e.target.files?.[0] || null)}
                        className={errors.accountsFile ? "border-red-500" : ""}
                      />
                      {errors.accountsFile && <p className="text-sm text-red-500">{errors.accountsFile}</p>}
                      {accountsFile && <p className="text-sm text-green-600">✓ {accountsFile.name} selected</p>}
                      <p className="text-sm text-muted-foreground">
                        CSV file containing donor account information. Required fields: ACT_ID, Email, names.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pledgesFile" className="flex items-center space-x-2">
                        <Upload className="w-4 h-4" />
                        <span>Pledge List CSV (Optional)</span>
                      </Label>
                      <Input
                        id="pledgesFile"
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileChange("pledges", e.target.files?.[0] || null)}
                      />
                      {pledgesFile && <p className="text-sm text-green-600">✓ {pledgesFile.name} selected</p>}
                      <p className="text-sm text-muted-foreground">
                        Optional CSV file containing pledge/donation data. Required fields: ACT_ID, PLG_Amount,
                        PLG_Date.
                      </p>
                    </div>
                  </div>
                )}

                {/* Toggle donor selection - only show for 'none' method */}
                {donorMethod === "none" && (
                  <div className="flex items-center space-x-2 pt-4 border-t">
                    <Switch
                      id="showDonorSelection"
                      checked={showDonorSelection}
                      onCheckedChange={setShowDonorSelection}
                    />
                    <Label htmlFor="showDonorSelection">Add donors now</Label>
                    <p className="text-sm text-muted-foreground">
                      {showDonorSelection
                        ? "Select donors to add to this list"
                        : "Create empty list (add donors later)"}
                    </p>
                  </div>
                )}

                <div className="flex justify-end space-x-4">
                  <Button type="button" variant="outline" onClick={() => router.push("/lists")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading
                      ? isCreating
                        ? "Creating..."
                        : isUploadingFiles
                        ? "Processing files..."
                        : "Adding donors..."
                      : donorMethod === "upload" && accountsFile
                      ? selectedStaffId && selectedStaffId !== "none"
                        ? "Create List, Upload Files & Assign Staff"
                        : "Create List & Upload Files"
                      : selectedDonorIds.length > 0
                      ? selectedStaffId && selectedStaffId !== "none"
                        ? `Create List with ${selectedDonorIds.length} Donor${
                            selectedDonorIds.length !== 1 ? "s" : ""
                          } & Assign Staff`
                        : `Create List with ${selectedDonorIds.length} Donor${selectedDonorIds.length !== 1 ? "s" : ""}`
                      : "Create List"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Donor Selection */}
          {donorMethod === "select" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Select Donors</span>
                </CardTitle>
                <CardDescription>
                  Choose which donors to include in this list. You can search by name or email.
                  {selectedStaffId && selectedStaffId !== "none" && (
                    <span className="block mt-2 text-sm font-medium text-blue-600">
                      All selected donors will be assigned to {staffMembers.find((s) => s.id === selectedStaffId)?.name}
                    </span>
                  )}
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
