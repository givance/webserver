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
import { ArrowLeft, Mail, Users, Edit2, Save, X, UserCheck, Activity, FileText, MessageSquare } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { formatCurrency } from "@/app/lib/utils/format";
import type { ColumnDef } from "@tanstack/react-table";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { trpc } from "@/app/lib/trpc/client";
import { GmailConnect } from "@/components/ui/GmailConnect";

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

  // Staff Gmail connection mutations - using the new staff-specific endpoints
  const { data: staffGmailStatus, refetch: refetchGmailStatus } =
    trpc.staffGmail.getStaffGmailConnectionStatus.useQuery({ staffId }, { enabled: !!staffId });

  const disconnectStaffGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      toast.success("Gmail account disconnected successfully");
      refetchGmailStatus();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to disconnect Gmail account");
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

  // Note: Gmail account management is now handled through the GmailConnect component

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
              <Badge variant={staffGmailStatus?.isConnected ? "default" : "secondary"}>
                {staffGmailStatus?.isConnected ? "Connected" : "Not Connected"}
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
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
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
                      <p className="text-sm">Click &quot;Edit Signature&quot; to add one</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Account Tab */}
        <TabsContent value="email">
          <GmailConnect
            context="staff"
            staffId={staffId}
            title="Email Account Connection"
            description="Link your Gmail account to this staff member to enable sending emails from their profile. When a Gmail account is linked, emails sent to donors assigned to this staff will be sent from their connected account instead of the organization's default account."
            onConnectionChange={() => {
              // Refetch staff data to update the UI
              refetchStaff();
            }}
          />
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp">
          <div className="space-y-6">
            {/* Phone Numbers Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp Phone Numbers
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manage phone numbers allowed to use WhatsApp services for this staff member.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>No WhatsApp phone numbers configured.</p>
                    <p className="text-sm">Contact your administrator to set up WhatsApp access.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  WhatsApp Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">0</div>
                    <div className="text-sm text-muted-foreground">Messages Sent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">0</div>
                    <div className="text-sm text-muted-foreground">Messages Received</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">0</div>
                    <div className="text-sm text-muted-foreground">DB Queries</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">0</div>
                    <div className="text-sm text-muted-foreground">Voice Messages</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity Log */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Activity Log
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Detailed log of all WhatsApp activities for this staff member.
                </p>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No WhatsApp activity recorded yet.</p>
                  <p className="text-sm">Activity will appear here once WhatsApp messages are processed.</p>
                </div>
              </CardContent>
            </Card>

            {/* Conversation History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Conversation History
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Recent WhatsApp conversations handled by this staff member.
                </p>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No conversation history available.</p>
                  <p className="text-sm">Conversations will appear here once messages are exchanged.</p>
                </div>
              </CardContent>
            </Card>
          </div>
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
