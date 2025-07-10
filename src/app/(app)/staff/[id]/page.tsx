'use client';

import { useStaff } from '@/app/hooks/use-staff';
import { useWhatsApp } from '@/app/hooks/use-whatsapp';
import { trpc } from '@/app/lib/trpc/client';
import { formatDonorName } from '@/app/lib/utils/donor-name-formatter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table/DataTable';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { GmailConnect } from '@/components/ui/GmailConnect';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { SignatureEditor, SignaturePreview } from '@/components/signature';
import { sanitizeHtml } from '@/app/lib/utils/sanitize-html';
import { InlineTextEdit, InlineToggleEdit } from '@/components/ui/inline-edit';
import { zodResolver } from '@hookform/resolvers/zod';
import type { CheckedState } from '@radix-ui/react-checkbox';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  ArrowLeft,
  Edit2,
  FileText,
  Mail,
  MessageSquare,
  Plus,
  Save,
  UserCheck,
  Users,
  X,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { usePagination } from '@/app/hooks/use-pagination';
import { EmailExampleDialog } from './components/EmailExampleDialog';

/**
 * Form schema for staff editing
 */
const editStaffSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  isRealPerson: z.boolean(),
});

/**
 * Form schema for signature editing
 */
const editSignatureSchema = z.object({
  signature: z.string().optional(),
});

/**
 * Form schema for adding phone numbers
 */
const addPhoneSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
});

type EditStaffFormValues = z.infer<typeof editStaffSchema>;
type EditSignatureFormValues = z.infer<typeof editSignatureSchema>;
type AddPhoneFormValues = z.infer<typeof addPhoneSchema>;

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
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [isAddingPhone, setIsAddingPhone] = useState(false);
  const [showCodeView, setShowCodeView] = useState(false);
  const [writingInstructions, setWritingInstructions] = useState('');
  const [isEmailExampleDialogOpen, setIsEmailExampleDialogOpen] = useState(false);
  const [editingEmailExample, setEditingEmailExample] = useState<any>(null);

  // Use pagination hook for donors table
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } =
    usePagination();

  const {
    getStaffById,
    getAssignedDonors,
    updateStaff,
    updateSignature,
    isUpdating,
    isUpdatingSignature,
    listEmailExamples,
    createEmailExample,
    updateEmailExample,
    deleteEmailExample,
    isCreatingEmailExample,
    isUpdatingEmailExample,
    isDeletingEmailExample,
  } = useStaff();
  const {
    getStaffPhoneNumbers,
    getActivityLog,
    getActivityStats,
    addPhoneNumber,
    removePhoneNumber,
    isAddingPhone: isAddingPhoneLoading,
    isRemovingPhone,
  } = useWhatsApp();

  // TRPC mutations for email account management

  // Staff Gmail connection mutations - using the new staff-specific endpoints
  const { data: staffGmailStatus, refetch: refetchGmailStatus } =
    trpc.staffGmail.getStaffGmailConnectionStatus.useQuery({ staffId }, { enabled: !!staffId });

  const disconnectStaffGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      toast.success('Gmail account disconnected successfully');
      refetchGmailStatus();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to disconnect Gmail account');
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
  } = getStaffById(staffId);

  // Fetch assigned donors
  const {
    data: donorsResponse,
    isLoading: isDonorsLoading,
    error: donorsError,
  } = getAssignedDonors(staffId);

  // Fetch email examples
  const {
    data: emailExamplesData,
    isLoading: isEmailExamplesLoading,
    refetch: refetchEmailExamples,
  } = listEmailExamples(staffId);

  // Fetch WhatsApp data
  const { data: phoneNumbersData, isLoading: isPhoneNumbersLoading } =
    getStaffPhoneNumbers(staffId);

  const { data: activityStats, isLoading: isStatsLoading } = getActivityStats(staffId, 30);

  const { data: activityLog, isLoading: isActivityLoading } = getActivityLog(staffId, 20, 0);

  // Helper functions for inline editing
  const handleUpdateStaffField = async (field: string, value: any) => {
    try {
      const result = await updateStaff({
        id: staffId,
        [field]: value,
      });
      if (result) {
        toast.success(`Updated ${field}`);
        await refetchStaff();
      } else {
        toast.error(`Failed to update ${field}`);
        throw new Error(`Failed to update ${field}`);
      }
    } catch (error) {
      toast.error(`Failed to update ${field}`);
      throw error;
    }
  };

  // Validation functions
  const validateEmail = (email: string): string | null => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Invalid email format';
    return null;
  };

  const validateName = (name: string): string | null => {
    if (!name || name.length < 2) return 'Name must be at least 2 characters';
    return null;
  };

  const signatureForm = useForm<EditSignatureFormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(editSignatureSchema),
    defaultValues: {
      signature: '',
    },
  });

  const phoneForm = useForm<AddPhoneFormValues>({
    // @ts-ignore - Known type mismatch with zodResolver and react-hook-form
    resolver: zodResolver(addPhoneSchema),
    defaultValues: {
      phoneNumber: '',
    },
  });

  // Update signature form and writing instructions when staff data loads
  React.useEffect(() => {
    if (staff) {
      signatureForm.reset({
        signature: staff.signature || '',
      });
      setWritingInstructions(staff.writingInstructions || '');
    }
  }, [staff, signatureForm]);

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
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link href={`/donors/${row.original.id}`} className="font-medium hover:underline">
          {row.getValue('name')}
        </Link>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.getValue('phone') || '—',
    },
    {
      accessorKey: 'currentStageName',
      header: 'Stage',
      cell: ({ row }) => {
        const stage = row.getValue('currentStageName') as string | null;
        return stage ? (
          <Badge variant="outline">{stage}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
  ];

  /**
   * Handle signature form submission
   */
  const onSignatureSubmit = async (values: EditSignatureFormValues) => {
    // Sanitize HTML before saving to database
    const sanitizedSignature = values.signature ? sanitizeHtml(values.signature) : '';

    await updateSignature({
      id: staffId,
      signature: sanitizedSignature,
    });
    setIsEditingSignature(false);
    await refetchStaff();
  };

  /**
   * Handle adding a new phone number
   */
  const onAddPhone = async (values: AddPhoneFormValues) => {
    try {
      await addPhoneNumber(staffId, values.phoneNumber);
      toast.success('Phone number added successfully');
      phoneForm.reset();
      setIsAddingPhone(false);
    } catch (error) {
      toast.error('Failed to add phone number');
      console.error('Error adding phone number:', error);
    }
  };

  /**
   * Cancel adding phone number and reset form
   */
  const handleCancelAddPhone = () => {
    phoneForm.reset();
    setIsAddingPhone(false);
  };

  // Note: Gmail account management is now handled through the GmailConnect component

  /**
   * Cancel signature editing and reset form
   */
  const handleCancelSignatureEdit = () => {
    if (staff) {
      signatureForm.reset({
        signature: staff.signature || '',
      });
    }
    setIsEditingSignature(false);
    setShowCodeView(false);
  };

  /**
   * Handle saving writing instructions
   */
  const handleSaveWritingInstructions = async () => {
    try {
      const result = await updateStaff({
        id: staffId,
        writingInstructions: writingInstructions,
      });
      if (result) {
        toast.success('Writing instructions saved successfully');
        await refetchStaff();
      } else {
        toast.error('Failed to save writing instructions');
      }
    } catch (error) {
      toast.error('Failed to save writing instructions');
      console.error('Error saving writing instructions:', error);
    }
  };

  /**
   * Handle creating or updating an email example
   */
  const handleEmailExampleSubmit = async (data: any) => {
    try {
      if (editingEmailExample) {
        // Update existing example
        const result = await updateEmailExample({
          id: editingEmailExample.id,
          ...data,
        });
        if (result) {
          toast.success('Email example updated successfully');
          await refetchEmailExamples();
          setEditingEmailExample(null);
        } else {
          toast.error('Failed to update email example');
        }
      } else {
        // Create new example
        const result = await createEmailExample({
          staffId,
          ...data,
        });
        if (result) {
          toast.success('Email example created successfully');
          await refetchEmailExamples();
        } else {
          toast.error('Failed to create email example');
        }
      }
    } catch (error) {
      toast.error(
        editingEmailExample ? 'Failed to update email example' : 'Failed to create email example'
      );
      console.error('Error saving email example:', error);
    }
  };

  /**
   * Handle deleting an email example
   */
  const handleDeleteEmailExample = async (id: number) => {
    if (!confirm('Are you sure you want to delete this email example?')) {
      return;
    }

    try {
      const result = await deleteEmailExample(id);
      if (result) {
        toast.success('Email example deleted successfully');
        await refetchEmailExamples();
      } else {
        toast.error('Failed to delete email example');
      }
    } catch (error) {
      toast.error('Failed to delete email example');
      console.error('Error deleting email example:', error);
    }
  };

  /**
   * Handle editing an email example
   */
  const handleEditEmailExample = (example: any) => {
    setEditingEmailExample(example);
    setIsEmailExampleDialogOpen(true);
  };

  /**
   * Handle adding a new email example
   */
  const handleAddEmailExample = () => {
    setEditingEmailExample(null);
    setIsEmailExampleDialogOpen(true);
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
              <Badge variant={staff.isRealPerson ? 'default' : 'secondary'}>
                {staff.isRealPerson ? 'Active' : 'Inactive'}
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
              <Badge variant={staffGmailStatus?.isConnected ? 'default' : 'secondary'}>
                {staffGmailStatus?.isConnected ? 'Connected' : 'Not Connected'}
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
              <Badge variant={staff.signature ? 'default' : 'secondary'}>
                {staff.signature ? 'Set' : 'Not Set'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Staff Information</TabsTrigger>
          <TabsTrigger value="signature">Email Signature</TabsTrigger>
          <TabsTrigger value="examples">
            Email Examples {emailExamplesData?.count ? `(${emailExamplesData.count})` : ''}
          </TabsTrigger>
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
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">First Name</label>
                    <InlineTextEdit
                      value={staff.firstName}
                      onSave={(value) => handleUpdateStaffField('firstName', value)}
                      validation={validateName}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                    <InlineTextEdit
                      value={staff.lastName}
                      onSave={(value) => handleUpdateStaffField('lastName', value)}
                      validation={validateName}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <InlineTextEdit
                      value={staff.email}
                      onSave={(value) => handleUpdateStaffField('email', value)}
                      type="email"
                      validation={validateEmail}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <InlineToggleEdit
                      value={staff.isRealPerson}
                      onSave={(value) => handleUpdateStaffField('isRealPerson', value)}
                      label="Real Person"
                      trueText="Active"
                      falseText="Inactive"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Writing Instructions Section */}
                <div className="mt-6">
                  <label className="text-sm font-medium text-muted-foreground">
                    Writing Instructions
                  </label>
                  <div className="mt-2">
                    <Textarea
                      value={writingInstructions}
                      onChange={(e) => setWritingInstructions(e.target.value)}
                      placeholder="Specific writing style guidelines for this staff member (e.g., formal tone, use of technical terms, personal anecdotes)..."
                      rows={4}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      These instructions will override the organization&apos;s default writing
                      guidelines when generating emails for this staff member. Leave blank to use
                      organizational defaults.
                    </p>
                    <div className="mt-3 flex justify-end">
                      <Button
                        onClick={handleSaveWritingInstructions}
                        disabled={
                          isUpdating || writingInstructions === (staff.writingInstructions || '')
                        }
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Instructions
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                  <p className="text-lg mt-1">{new Date(staff.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
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
                            <SignatureEditor
                              value={field.value || ''}
                              onChange={field.onChange}
                              showCodeView={showCodeView}
                              onCodeViewChange={setShowCodeView}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Live Preview */}
                    <SignaturePreview
                      signature={signatureForm.watch('signature') || ''}
                      staffName={`${staff?.firstName} ${staff?.lastName}`}
                    />

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={handleCancelSignatureEdit}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isUpdatingSignature}>
                        <Save className="h-4 w-4 mr-2" />
                        {isUpdatingSignature ? 'Saving...' : 'Save Signature'}
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <SignaturePreview
                    signature={staff.signature || ''}
                    staffName={`${staff.firstName} ${staff.lastName}`}
                  />
                  {!staff.signature && (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">
                        Click &quot;Edit Signature&quot; to add a custom signature
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Examples Tab */}
        <TabsContent value="examples">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Email Examples</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Email examples that will be used as references for AI-generated emails
                  </p>
                </div>
                <Button variant="outline" onClick={handleAddEmailExample}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Example
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isEmailExamplesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full mt-1" />
                    </div>
                  ))}
                </div>
              ) : emailExamplesData?.examples && emailExamplesData.examples.length > 0 ? (
                <div className="space-y-4">
                  {emailExamplesData.examples.map((example) => (
                    <div
                      key={example.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-lg">{example.subject}</h4>
                          {example.category && (
                            <Badge variant="outline" className="mt-1">
                              {example.category
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditEmailExample(example)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmailExample(example.id)}
                            disabled={isDeletingEmailExample}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">
                        {example.content}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Created {new Date(example.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {emailExamplesData.count > 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                      {emailExamplesData.count} email example
                      {emailExamplesData.count !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No email examples added yet.</p>
                  <p className="text-sm">
                    Click &quot;Add Example&quot; to add your first email example.
                  </p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      WhatsApp Phone Numbers
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Manage phone numbers allowed to use WhatsApp services for this staff member.
                    </p>
                  </div>
                  {!isAddingPhone && (
                    <Button variant="outline" onClick={() => setIsAddingPhone(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Phone Number
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Add Phone Number Form */}
                {isAddingPhone && (
                  <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                    <Form {...phoneForm}>
                      <form
                        // @ts-ignore - Known type mismatch with react-hook-form, but works as expected
                        onSubmit={phoneForm.handleSubmit(onAddPhone)}
                        className="space-y-4"
                      >
                        <FormField
                          // @ts-ignore - Known type mismatch with react-hook-form's Control type
                          control={phoneForm.control}
                          name="phoneNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Enter phone number (e.g., +1234567890)"
                                  type="tel"
                                />
                              </FormControl>
                              <FormMessage />
                              <p className="text-sm text-muted-foreground">
                                Include country code (e.g., +1 for US, +44 for UK)
                              </p>
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={handleCancelAddPhone}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isAddingPhoneLoading}>
                            <Plus className="h-4 w-4 mr-2" />
                            {isAddingPhoneLoading ? 'Adding...' : 'Add Phone Number'}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                )}

                {isPhoneNumbersLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : phoneNumbersData?.phoneNumbers && phoneNumbersData.phoneNumbers.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      {phoneNumbersData.phoneNumbers.map((phoneData, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-green-600" />
                            <span className="font-medium">{phoneData.phoneNumber}</span>
                            <Badge variant="outline" className="text-xs">
                              {phoneData.isAllowed ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removePhoneNumber(staffId, phoneData.phoneNumber)}
                            disabled={isRemovingPhone}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {phoneNumbersData.count} phone number{phoneNumbersData.count !== 1 ? 's' : ''}{' '}
                      configured
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>No WhatsApp phone numbers configured.</p>
                    <p className="text-sm">Click &quot;Add Phone Number&quot; to get started.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  WhatsApp Activity Summary (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isStatsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="text-center">
                        <Skeleton className="h-8 w-16 mx-auto mb-2" />
                        <Skeleton className="h-4 w-20 mx-auto" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {activityStats?.messagesSent || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Responses Generated</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {activityStats?.messagesReceived || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Messages Received</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {activityStats?.dbQueriesExecuted || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">DB Queries</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {activityStats?.voiceTranscribed || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Voice Messages</div>
                    </div>
                  </div>
                )}
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
                {isActivityLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : activityLog?.activities && activityLog.activities.length > 0 ? (
                  <div className="space-y-4">
                    {activityLog.activities
                      .filter((activity, index, arr) => {
                        // Filter out ai_response_generated if there's a message_sent for the same response
                        if (activity.activityType === 'ai_response_generated') {
                          // Look for a message_sent activity with similar timestamp (within 5 seconds) and same response
                          const activityTime = new Date(activity.createdAt).getTime();
                          const hasCorrespondingMessageSent = arr.some((otherActivity) => {
                            if (otherActivity.activityType === 'message_sent') {
                              const otherTime = new Date(otherActivity.createdAt).getTime();
                              const timeDiff = Math.abs(activityTime - otherTime);
                              // Check if they're within 5 seconds and have the same response content
                              return (
                                timeDiff < 5000 &&
                                activity.data?.response === otherActivity.data?.responseContent
                              );
                            }
                            return false;
                          });

                          if (hasCorrespondingMessageSent) {
                            // Skip ai_response_generated if there's a corresponding message_sent
                            return false;
                          }
                        }
                        return true;
                      })
                      .map((activity, index) => {
                        // Improve activity type display names
                        const getActivityDisplayName = (activityType: string) => {
                          switch (activityType) {
                            case 'message_sent':
                              return 'Response Generated';
                            case 'ai_response_generated':
                              return 'Response Generated';
                            case 'message_received':
                              return 'Message Received';
                            case 'db_query_executed':
                              return 'Database Query';
                            case 'voice_transcribed':
                              return 'Voice Transcribed';
                            case 'permission_denied':
                              return 'Permission Denied';
                            case 'error_occurred':
                              return 'Error';
                            default:
                              return activityType.replace(/_/g, ' ');
                          }
                        };

                        const getActivityColor = (activityType: string) => {
                          switch (activityType) {
                            case 'message_sent':
                            case 'ai_response_generated':
                              return 'bg-blue-100 text-blue-800';
                            case 'message_received':
                              return 'bg-green-100 text-green-800';
                            case 'db_query_executed':
                              return 'bg-purple-100 text-purple-800';
                            case 'voice_transcribed':
                              return 'bg-orange-100 text-orange-800';
                            case 'permission_denied':
                              return 'bg-red-100 text-red-800';
                            case 'error_occurred':
                              return 'bg-red-100 text-red-800';
                            default:
                              return 'bg-gray-100 text-gray-800';
                          }
                        };

                        return (
                          <div key={index} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Badge className={getActivityColor(activity.activityType)}>
                                  {getActivityDisplayName(activity.activityType)}
                                </Badge>
                                {activity.metadata?.tokensUsed && (
                                  <Badge variant="outline" className="text-xs">
                                    {activity.metadata.tokensUsed.totalTokens} tokens
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {new Date(activity.createdAt).toLocaleString()}
                              </span>
                            </div>

                            {/* Summary */}
                            <p className="text-sm text-gray-700 mb-2">{activity.summary}</p>

                            {/* Message content for readability */}
                            {activity.data?.messageContent && (
                              <div className="bg-gray-50 p-3 rounded text-sm mb-2">
                                <span className="font-medium text-gray-600">Message: </span>
                                <span>{activity.data.messageContent}</span>
                              </div>
                            )}

                            {activity.data?.responseContent && (
                              <div className="bg-blue-50 p-3 rounded text-sm mb-2">
                                <span className="font-medium text-blue-600">Response: </span>
                                <span>{activity.data.responseContent}</span>
                              </div>
                            )}

                            {activity.data?.response && (
                              <div className="bg-blue-50 p-3 rounded text-sm mb-2">
                                <span className="font-medium text-blue-600">AI Response: </span>
                                <span>{activity.data.response}</span>
                              </div>
                            )}

                            {activity.data?.query && (
                              <div className="bg-purple-50 p-3 rounded text-sm mb-2">
                                <span className="font-medium text-purple-600">Query: </span>
                                <code className="text-xs">{activity.data.query}</code>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {activityLog.hasMore && (
                      <div className="text-center">
                        <Button variant="outline" size="sm">
                          Load More Activities
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>No WhatsApp activity recorded yet.</p>
                    <p className="text-sm">
                      Activity will appear here once WhatsApp messages are processed.
                    </p>
                  </div>
                )}
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
                  pageSize={pageSize}
                  pageCount={getPageCount(assignedDonors.length)}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size: number) => setPageSize(size as 10 | 20 | 50 | 100)}
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

      {/* Email Example Dialog */}
      <EmailExampleDialog
        open={isEmailExampleDialogOpen}
        onOpenChange={setIsEmailExampleDialogOpen}
        example={editingEmailExample}
        onSubmit={handleEmailExampleSubmit}
        isSubmitting={isCreatingEmailExample || isUpdatingEmailExample}
      />
    </div>
  );
}
