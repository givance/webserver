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
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { ArrowLeft, Mail, Users, Edit2, Save, X, UserCheck, Activity } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { formatCurrency } from "@/app/lib/utils/format";
import type { ColumnDef } from "@tanstack/react-table";
import type { CheckedState } from "@radix-ui/react-checkbox";

/**
 * Form schema for staff editing
 */
const editStaffSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  isRealPerson: z.boolean(),
});

type EditStaffFormValues = z.infer<typeof editStaffSchema>;

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

  const { getStaffById, getAssignedDonors, updateStaff, isUpdating } = useStaff();

  // Fetch staff data
  const {
    data: staff,
    isLoading: isStaffLoading,
    error: staffError,
  } = getStaffById({ id: staffId }, { enabled: !!staffId });

  // Fetch assigned donors
  const {
    data: donorsResponse,
    isLoading: isDonorsLoading,
    error: donorsError,
  } = getAssignedDonors({ id: staffId }, { enabled: !!staffId });

  // Initialize form with staff data
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

  // Update form when staff data loads
  React.useEffect(() => {
    if (staff) {
      form.reset({
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        isRealPerson: staff.isRealPerson,
      });
    }
  }, [staff, form]);

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

  // Loading state
  if (isStaffLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Date(staff.createdAt).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Information */}
      <Card className="mb-6">
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned Donors */}
      <Tabs defaultValue="donors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="donors">Assigned Donors ({donorCount})</TabsTrigger>
        </TabsList>

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
                  No donors are currently assigned to this staff member.
                  <br />
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
