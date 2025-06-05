"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useStaff } from "@/app/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { ArrowLeft, Mail, Users, Edit2, Save, X, UserCheck, Activity, FileText, Link2, Unlink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { formatCurrency } from "@/app/lib/utils/format";
import type { ColumnDef } from "@tanstack/react-table";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { trpc } from "@/app/lib/trpc/client";

/**
 * Form schema for staff editing
 */
const editStaffSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  isRealPerson: z.boolean(),
});

/**
 * Form schema for signature editing
 */
const editSignatureSchema = z.object({
  signature: z.string().optional(),
});

type EditStaffFormValues = z.infer<typeof editStaffSchema>;
type EditSignatureFormValues = z.infer<typeof editSignatureSchema>;

/**
 * Type for assigned donor display
 */
type AssignedDonor = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  totalDonated: number;
  lastDonationDate: string | null;
  currentStageName: string | null;
};

export default function StaffDetailPage() {
  const params = useParams();
  const router = useRouter();
  const staffId = Number(params.id);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingSignature, setIsEditingSignature] = useState(false);

  const { getStaffById, getAssignedDonors, updateStaff, isUpdating } = useStaff();

  // TRPC mutations for signature and email account management
  const updateSignatureMutation = trpc.staff.updateSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature updated successfully");
      setIsEditingSignature(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update signature");
    },
  });

  const linkEmailAccountMutation = trpc.staff.linkEmailAccount.useMutation({
    onSuccess: () => {
      toast.success("Email account linked successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to link email account");
    },
  });

  const unlinkEmailAccountMutation = trpc.staff.unlinkEmailAccount.useMutation({
    onSuccess: () => {
      toast.success("Email account unlinked successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to unlink email account");
    },
  });

  // Get Gmail connection status
  const { data: gmailConnectionStatus } = trpc.gmail.getGmailConnectionStatus.useQuery();

  // Fetch staff data
  const {
    data: staff,
    isLoading: isStaffLoading,
    error: staffError,
    refetch: refetchStaff,
  } = getStaffById({ id: staffId }, { enabled: !!staffId });

  // Fetch assigned donors
  const {
    data: donorsResponse,
    isLoading: isDonorsLoading,
    error: donorsError,
  } = getAssignedDonors({ id: staffId }, { enabled: !!staffId });

  // Initialize forms
  const form = useForm<EditStaffFormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(editStaffSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      isRealPerson: true,
    },
  });

  const signatureForm = useForm<EditSignatureFormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(editSignatureSchema),
    defaultValues: {
      signature: "",
    },
  });

  // Update forms when staff data loads
  React.useEffect(() => {
    if (staff) {
      form.reset({
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        isRealPerson: staff.isRealPerson,
      });
      signatureForm.reset({
        signature: staff.signature || "",
      });
    }
  }, [staff, form, signatureForm]);

  // Process assigned donors data
  const { assignedDonors, donorCount, totalValue } = useMemo(() => {
    if (!donorsResponse?.donors) {
      return { assignedDonors: [], donorCount: 0, totalValue: 0 };
    }

    const donorItems: AssignedDonor[] = donorsResponse.donors.map((donor) => ({
      id: donor.id,
      name: formatDonorName(donor),
      email: donor.email,
      phone: donor.phone,
      totalDonated: 0, // Would need donor stats for actual value
      lastDonationDate: null, // Would need donor stats for actual date
      currentStageName: donor.currentStageName,
    }));

    return {
      assignedDonors: donorItems,
      donorCount: donorsResponse.donors.length,
      totalValue: 0, // Would calculate from actual donation data
    };
  }, [donorsResponse]);

  // Define columns for assigned donors table
  const donorColumns: ColumnDef<AssignedDonor>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link href={`/donors/${row.original.id}`} className="font-medium hover:underline">
          {row.getValue("name")}
        </Link>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => row.getValue("phone") || "—",
    },
    {
      accessorKey: "currentStageName",
      header: "Stage",
      cell: ({ row }) => {
        const stage = row.getValue("currentStageName") as string | null;
        return stage ? <Badge variant="outline">{stage}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
  ];

  /**
   * Handle form submission for staff updates
   */
  const onSubmit = async (values: EditStaffFormValues) => {
    try {
      const result = await updateStaff({
        id: staffId,
        ...values,
      });

      if (result) {
        toast.success("Staff member updated successfully");
        setIsEditing(false);
      } else {
        toast.error("Failed to update staff member");
      }
    } catch (error) {
      toast.error("An error occurred while updating staff member");
      console.error("Error updating staff:", error);
    }
  };

  /**
   * Handle signature form submission
   */
  const onSignatureSubmit = async (values: EditSignatureFormValues) => {
    try {
      await updateSignatureMutation.mutateAsync({
        id: staffId,
        signature: values.signature,
      });
      await refetchStaff();
    } catch (error) {
      console.error("Error updating signature:", error);
    }
  };

  /**
   * Handle linking email account
   */
  const handleLinkEmailAccount = async () => {
    if (!gmailConnectionStatus?.isConnected) {
      toast.error("Please connect your Gmail account first from Settings");
      return;
    }

    try {
      await linkEmailAccountMutation.mutateAsync({
        staffId,
      });
      await refetchStaff();
      toast.success("Email account linked successfully");
    } catch (error) {
      console.error("Error linking email account:", error);
      toast.error("Failed to link email account");
    }
  };

  /**
   * Handle unlinking email account
   */
  const handleUnlinkEmailAccount = async () => {
    try {
      await unlinkEmailAccountMutation.mutateAsync({ staffId });
      await refetchStaff();
    } catch (error) {
      console.error("Error unlinking email account:", error);
    }
  };

  /**
   * Cancel editing and reset form
   */
  const handleCancelEdit = () => {
    if (staff) {
      form.reset({
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        isRealPerson: staff.isRealPerson,
      });
    }
    setIsEditing(false);
  };

  /**
   * Cancel signature editing and reset form
   */
  const handleCancelSignatureEdit = () => {
    if (staff) {
      signatureForm.reset({
        signature: staff.signature || "",
      });
    }
    setIsEditingSignature(false);
  };

  // Loading state
  if (isStaffLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Error state
  if (staffError || !staff) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/staff" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Staff Not Found</h1>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {staffError?.message || "The staff member you're looking for could not be found."}
          </p>
          <Button asChild className="mt-4">
            <Link href="/staff">Back to Staff List</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link href="/staff" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {staff.firstName} {staff.lastName}
            </h1>
            <p className="text-muted-foreground">{staff.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Staff
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/communications?staffId=${staffId}`}>
              <Mail className="h-4 w-4 mr-2" />
              View Communications
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Donors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{donorCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={staff.isRealPerson ? "default" : "secondary"}>
                {staff.isRealPerson ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Account</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={staff.linkedGmailTokenId ? "default" : "secondary"}>
                {staff.linkedGmailTokenId ? "Connected" : "Not Connected"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signature</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={staff.signature ? "default" : "secondary"}>{staff.signature ? "Set" : "Not Set"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Staff Information</TabsTrigger>
          <TabsTrigger value="signature">Email Signature</TabsTrigger>
          <TabsTrigger value="email">Email Account</TabsTrigger>
          <TabsTrigger value="donors">Assigned Donors ({donorCount})</TabsTrigger>
        </TabsList>

        {/* Staff Information Tab */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Staff Information</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Form {...form}>
                  <form
                    // @ts-ignore - Known type mismatch with react-hook-form, but works as expected
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        // @ts-ignore - Known type mismatch with react-hook-form's Control type
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        // @ts-ignore - Known type mismatch with react-hook-form's Control type
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      // @ts-ignore - Known type mismatch with react-hook-form's Control type
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      // @ts-ignore - Known type mismatch with react-hook-form's Control type
                      control={form.control}
                      name="isRealPerson"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked: CheckedState) => {
                                field.onChange(checked === true);
                              }}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Active Staff Member</FormLabel>
                            <p className="text-sm text-muted-foreground">Is this person currently active?</p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={handleCancelEdit}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isUpdating}>
                        <Save className="h-4 w-4 mr-2" />
                        {isUpdating ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">First Name</label>
                      <p className="text-lg">{staff.firstName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Last Name</label>
                      <p className="text-lg">{staff.lastName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <p className="text-lg">{staff.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <p className="text-lg">
                        <Badge variant={staff.isRealPerson ? "default" : "secondary"}>
                          {staff.isRealPerson ? "Active" : "Inactive"}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Member Since</label>
                      <p className="text-lg">{new Date(staff.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Signature Tab */}
        <TabsContent value="signature">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Email Signature</CardTitle>
                {!isEditingSignature && (
                  <Button variant="outline" onClick={() => setIsEditingSignature(true)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Signature
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditingSignature ? (
                <Form {...signatureForm}>
                  <form
                    // @ts-ignore - Known type mismatch with react-hook-form, but works as expected
                    onSubmit={signatureForm.handleSubmit(onSignatureSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      // @ts-ignore - Known type mismatch with react-hook-form's Control type
                      control={signatureForm.control}
                      name="signature"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Signature</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Enter email signature..."
                              rows={8}
                              className="resize-none"
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-sm text-muted-foreground">
                            This signature will be automatically included in emails sent on behalf of this staff member.
                          </p>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={handleCancelSignatureEdit}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateSignatureMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        {updateSignatureMutation.isPending ? "Saving..." : "Save Signature"}
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  {staff.signature ? (
                    <div>
                      <label className="text-sm font-medium">Current Signature</label>
                      <div className="mt-2 p-4 bg-gray-50 rounded-md">
                        <pre className="whitespace-pre-wrap text-sm font-sans">{staff.signature}</pre>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p>No email signature set</p>
                      <p className="text-sm">Click "Edit Signature" to add one</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Account Tab */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Account Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Connection Status</label>
                  <div className="flex items-center gap-2 mt-2">
                    {staff.linkedGmailTokenId ? (
                      <>
                        <Badge variant="default" className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Connected
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          This staff member has a linked Gmail account
                        </span>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Not Connected
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          No Gmail account linked to this staff member
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    When a Gmail account is linked to a staff member, emails sent to donors assigned to this staff will
                    be sent from their connected account instead of the organization's default account.
                  </p>
                </div>

                <div className="flex gap-2">
                  {staff.linkedGmailTokenId ? (
                    <Button
                      variant="outline"
                      onClick={handleUnlinkEmailAccount}
                      disabled={unlinkEmailAccountMutation.isPending}
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      {unlinkEmailAccountMutation.isPending ? "Unlinking..." : "Unlink Account"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleLinkEmailAccount}
                      disabled={linkEmailAccountMutation.isPending || !gmailConnectionStatus?.isConnected}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      {linkEmailAccountMutation.isPending ? "Linking..." : "Link Gmail Account"}
                    </Button>
                  )}
                </div>

                {!gmailConnectionStatus?.isConnected && !staff.linkedGmailTokenId && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> You need to connect your Gmail account in Settings before you can link it
                      to this staff member.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" asChild>
                      <Link href="/settings">Go to Settings</Link>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assigned Donors Tab */}
        <TabsContent value="donors">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Donors</CardTitle>
            </CardHeader>
            <CardContent>
              {isDonorsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : donorsError ? (
                <div className="text-center py-8 text-red-500">
                  Error loading assigned donors: {donorsError.message}
                </div>
              ) : assignedDonors.length > 0 ? (
                <DataTable
                  columns={donorColumns}
                  data={assignedDonors}
                  totalItems={assignedDonors.length}
                  pageSize={20}
                  pageCount={Math.ceil(assignedDonors.length / 20)}
                  currentPage={1}
                  onPageChange={() => {}}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No donors are currently assigned to this staff member.</p>
                  <Link href="/donors" className="text-blue-600 hover:underline mt-2 inline-block">
                    Assign donors from the donor list
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
