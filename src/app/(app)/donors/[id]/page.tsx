'use client';

import { useCommunications } from '@/app/hooks/use-communications';
import { useDonations } from '@/app/hooks/use-donations';
import { useDonors } from '@/app/hooks/use-donors';
import { useProjects } from '@/app/hooks/use-projects';
import { usePagination, PAGE_SIZE_OPTIONS } from '@/app/hooks/use-pagination';
import { formatDonorName } from '@/app/lib/utils/donor-name-formatter';
import { formatCurrency } from '@/app/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineTextEdit, InlineSelectEdit, InlineToggleEdit } from '@/components/ui/inline-edit';
import { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  ArrowLeft,
  Calendar,
  DollarSign,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Edit,
  Save,
  X,
  MapPin,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { DonorResearchDisplay } from '@/components/research/DonorResearchDisplay';
import { useDonorResearchData } from '@/app/hooks/use-donor-research';
import { toast } from 'sonner';
import { trpc } from '@/app/lib/trpc/client';
import { type DonorNote } from '@/app/lib/db/schema';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';

type DonationRow = {
  id: number;
  date: string;
  amount: number;
  projectId: number;
  projectName: string;
  status: string;
};

type CommunicationRow = {
  id: number;
  channel: string;
  createdAt: string;
  latestMessage: string;
  staff: string[];
};

export default function DonorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const donorId = Number(params.id);

  // Use pagination hook like main donors page
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } =
    usePagination();

  // Notes editing state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');

  // Fetch donor data
  const { getDonorQuery, updateDonor, getDonorStats } = useDonors();
  const donorQuery = getDonorQuery(donorId);
  const { data: donor, isLoading: isDonorLoading, error: donorError } = donorQuery;

  // Fetch donor stats for summary cards
  const { data: donorStats } = getDonorStats(donorId);

  // Fetch donor donations with proper pagination
  const { listDonations } = useDonations();
  const { data: donationsResponse, isLoading: isDonationsLoading } = listDonations({
    donorId,
    includeDonor: false,
    includeProject: true,
    limit: pageSize,
    offset: getOffset(),
    orderBy: 'date',
    orderDirection: 'desc',
  });

  // Fetch donor communications
  const { listThreads } = useCommunications();
  const { data: communicationsResponse, isLoading: isCommunicationsLoading } = listThreads({
    donorId,
    includeStaff: true,
    includeDonors: false,
    includeLatestMessage: true,
    limit: 100, // Get all communications for now
  });

  // Fetch donor research data
  const { hasResearch, conductResearch, isConductingResearch } = useDonorResearchData(donorId);

  // Fetch projects for donation form
  const { listProjects } = useProjects();
  const { data: projectsResponse } = listProjects({
    active: true,
    limit: 100, // Get all active projects
  });

  // Donation form schema
  const donationFormSchema = z.object({
    projectId: z.number({ required_error: 'Please select a project' }),
    amount: z
      .number({ required_error: 'Please enter an amount' })
      .min(0.01, 'Amount must be greater than 0'),
    date: z.date({ required_error: 'Please select a date' }),
  });

  type DonationFormData = z.infer<typeof donationFormSchema>;

  // Donation form state
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  const donationForm = useForm<DonationFormData>({
    resolver: zodResolver(donationFormSchema),
    defaultValues: {
      date: new Date(),
      amount: 0,
    },
  });

  // Create donation mutation
  const utils = trpc.useUtils();
  const createDonationMutation = trpc.donations.create.useMutation({
    onSuccess: () => {
      toast.success('Donation added successfully');
      setDonationDialogOpen(false);
      donationForm.reset();
      // Invalidate and refetch donations to update the table
      utils.donations.list.invalidate();
      utils.donations.getDonorStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add donation');
    },
  });

  // Handle donation form submission
  const onSubmitDonation = (data: DonationFormData) => {
    createDonationMutation.mutate({
      donorId,
      projectId: data.projectId,
      amount: Math.round(data.amount * 100), // Convert to cents
      currency: 'USD',
    });
  };

  // Add note mutation
  const addNoteMutation = trpc.donors.addNote.useMutation({
    onSuccess: () => {
      toast.success('Note added successfully');
      setNewNoteContent('');
      setIsAddingNote(false);
      // Refetch donor data to get updated notes
      donorQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  // Helper functions for inline editing
  const handleUpdateField = async (field: string, value: any) => {
    try {
      await updateDonor({
        id: donorId,
        [field]: value || undefined,
      });
      toast.success(`Updated ${field}`);
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

  const validatePhone = (phone: string): string | null => {
    if (!phone) return null; // Phone is optional
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(phone)) return 'Invalid phone format';
    return null;
  };

  const validateName = (name: string): string | null => {
    if (!name || name.length < 2) return 'Name must be at least 2 characters';
    return null;
  };

  // Handle notes
  const handleAddNote = async () => {
    if (!newNoteContent.trim()) {
      toast.error('Note content cannot be empty');
      return;
    }

    await addNoteMutation.mutateAsync({
      donorId,
      content: newNoteContent.trim(),
    });
  };

  const handleCancelAddNote = () => {
    setNewNoteContent('');
    setIsAddingNote(false);
  };

  // Format notes for display
  const notes = (donor?.notes as DonorNote[]) || [];

  // Process donations data
  const { donations, totalDonated, donationCount, totalCount } = useMemo(() => {
    if (!donationsResponse?.donations) {
      return {
        donations: [],
        totalDonated: 0,
        donationCount: 0,
        totalCount: 0,
      };
    }

    const donationItems: DonationRow[] = donationsResponse.donations.map((donation) => ({
      id: donation.id,
      date: new Date(donation.date).toISOString(),
      amount: donation.amount,
      projectId: donation.project?.id || 0,
      projectName: donation.project?.name || 'Unknown Project',
      status: 'completed', // Assuming all donations are completed
    }));

    // For current page donations, calculate the total from current page
    const currentPageTotal = donationsResponse.donations.reduce(
      (sum, donation) => sum + donation.amount,
      0
    );

    return {
      donations: donationItems,
      totalDonated: currentPageTotal, // This is just for current page display
      donationCount: donationsResponse.donations.length, // Current page count
      totalCount: donationsResponse.totalCount || 0, // Total count from server
    };
  }, [donationsResponse]);

  // Process communications data
  const { communications, communicationCount } = useMemo(() => {
    if (!communicationsResponse?.threads) {
      return { communications: [], communicationCount: 0 };
    }

    const communicationItems: CommunicationRow[] = communicationsResponse.threads.map((thread) => ({
      id: thread.id,
      channel: thread.channel,
      createdAt: new Date(thread.createdAt).toISOString(),
      latestMessage: thread.content?.[0]?.content || 'No messages',
      staff:
        thread.staff?.map((s) => `${s.staff?.firstName} ${s.staff?.lastName}`).filter(Boolean) ||
        [],
    }));

    return {
      communications: communicationItems,
      communicationCount: communicationsResponse.threads.length,
    };
  }, [communicationsResponse]);

  // Define columns for donations table
  const donationColumns: ColumnDef<DonationRow>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => new Date(row.getValue('date')).toLocaleDateString(),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => formatCurrency(row.getValue('amount')),
    },
    {
      accessorKey: 'projectName',
      header: 'Project',
      cell: ({ row }) => {
        const projectId = row.original.projectId;
        const projectName = row.getValue('projectName') as string;
        return projectId ? (
          <Link href={`/projects/${projectId}`} className="hover:underline text-blue-600">
            {projectName}
          </Link>
        ) : (
          <span>{projectName}</span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.getValue('status') === 'completed' ? 'default' : 'secondary'}>
          {row.getValue('status')}
        </Badge>
      ),
    },
  ];

  // Define columns for communications table
  const communicationColumns: ColumnDef<CommunicationRow>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => new Date(row.getValue('createdAt')).toLocaleDateString(),
    },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.getValue('channel')}
        </Badge>
      ),
    },
    {
      accessorKey: 'staff',
      header: 'Staff',
      cell: ({ row }) => {
        const staff = row.getValue('staff') as string[];
        return staff.length > 0 ? staff.join(', ') : 'Unassigned';
      },
    },
    {
      accessorKey: 'latestMessage',
      header: 'Latest Message',
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate" title={row.getValue('latestMessage')}>
          {row.getValue('latestMessage')}
        </div>
      ),
    },
  ];

  if (isDonorLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (donorError || !donor) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Link href="/donors" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-red-600">
            {donorError ? 'Error loading donor' : 'Donor not found'}
          </h1>
        </div>
        <div className="text-muted-foreground">
          {donorError
            ? 'There was an error loading the donor information.'
            : 'The requested donor could not be found.'}
        </div>
      </div>
    );
  }

  const lastDonationDate = donorStats?.lastDonationDate
    ? new Date(donorStats.lastDonationDate)
    : null;

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link href="/donors" className="mr-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {formatDonorName(donor)}
              {donor.externalId && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  External ID: ({donor.externalId})
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">{donor.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Research button hidden
          <Button variant="outline" onClick={conductResearch} disabled={isConductingResearch}>
            <Search className="h-4 w-4 mr-2" />
            {isConductingResearch ? "Researching..." : "Research"}
          </Button>
          */}
        </div>
      </div>

      {/* Summary Cards */}
      <div
        className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
        style={{ listStyle: 'none', counterReset: 'none' }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(donorStats?.totalDonated || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donations</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Donation</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastDonationDate ? lastDonationDate.toLocaleDateString() : 'Never'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Communications</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{communicationCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <InlineTextEdit
                value={donor.email}
                onSave={(value) => handleUpdateField('email', value)}
                type="email"
                validation={validateEmail}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <InlineTextEdit
                value={donor.phone || ''}
                onSave={(value) => handleUpdateField('phone', value)}
                type="tel"
                validation={validatePhone}
                emptyText="Add phone number"
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <InlineTextEdit
                value={donor.address || ''}
                onSave={(value) => handleUpdateField('address', value)}
                placeholder="Street address"
                emptyText="Add address"
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 flex-shrink-0" /> {/* Spacer for alignment */}
              <InlineTextEdit
                value={donor.state || ''}
                onSave={(value) => handleUpdateField('state', value)}
                placeholder="State"
                emptyText="Add state"
                className="flex-1"
              />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Notes</h4>
              {!isAddingNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingNote(true)}
                  className="h-8 px-2"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Notes list */}
            <div className="space-y-2 mb-3">
              {notes.length === 0 ? (
                <p className="text-muted-foreground">No notes added yet.</p>
              ) : (
                notes.map((note, index) => (
                  <div key={index} className="border rounded-md p-3 bg-muted/30">
                    <p className="text-sm">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(note.createdAt).toLocaleDateString()} at{' '}
                      {new Date(note.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Add note form */}
            {isAddingNote && (
              <div className="border rounded-md p-3 bg-muted/10">
                <Textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Add a note about this donor..."
                  className="min-h-[80px] mb-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={!newNoteContent.trim() || addNoteMutation.isPending}
                  >
                    {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelAddNote}
                    disabled={addNoteMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Donor Details & Management */}
      <Card className="mb-6" style={{ listStyle: 'none', counterReset: 'none' }}>
        <CardHeader>
          <CardTitle>Donor Details & Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6" style={{ listStyle: 'none', counterReset: 'none' }}>
          {/* Basic Information */}
          <div style={{ listStyle: 'none', counterReset: 'none' }}>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">First Name</label>
                <InlineTextEdit
                  value={donor.firstName}
                  onSave={(value) => handleUpdateField('firstName', value)}
                  validation={validateName}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Last Name</label>
                <InlineTextEdit
                  value={donor.lastName}
                  onSave={(value) => handleUpdateField('lastName', value)}
                  validation={validateName}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-muted-foreground">Display Name</label>
                <InlineTextEdit
                  value={donor.displayName || ''}
                  onSave={(value) => handleUpdateField('displayName', value)}
                  placeholder="Enter display name"
                  emptyText="Add display name"
                />
              </div>
            </div>
          </div>

          {/* Couple Information (if applicable) */}
          {donor.isCouple && (
            <div style={{ listStyle: 'none', counterReset: 'none' }}>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Couple Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h5 className="text-sm font-medium">His Information</h5>
                  <div>
                    <label className="text-sm text-muted-foreground">Title</label>
                    <InlineTextEdit
                      value={donor.hisTitle || ''}
                      onSave={(value) => handleUpdateField('hisTitle', value)}
                      placeholder="Mr., Dr., Rabbi, etc."
                      emptyText="Add title"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">First Name</label>
                    <InlineTextEdit
                      value={donor.hisFirstName || ''}
                      onSave={(value) => handleUpdateField('hisFirstName', value)}
                      emptyText="Add first name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Name</label>
                    <InlineTextEdit
                      value={donor.hisLastName || ''}
                      onSave={(value) => handleUpdateField('hisLastName', value)}
                      emptyText="Add last name"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-sm font-medium">Her Information</h5>
                  <div>
                    <label className="text-sm text-muted-foreground">Title</label>
                    <InlineTextEdit
                      value={donor.herTitle || ''}
                      onSave={(value) => handleUpdateField('herTitle', value)}
                      placeholder="Mrs., Ms., Dr., etc."
                      emptyText="Add title"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">First Name</label>
                    <InlineTextEdit
                      value={donor.herFirstName || ''}
                      onSave={(value) => handleUpdateField('herFirstName', value)}
                      emptyText="Add first name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Name</label>
                    <InlineTextEdit
                      value={donor.herLastName || ''}
                      onSave={(value) => handleUpdateField('herLastName', value)}
                      emptyText="Add last name"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional Information */}
          <div style={{ listStyle: 'none', counterReset: 'none' }}>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Additional Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">External ID</label>
                <InlineTextEdit
                  value={donor.externalId || ''}
                  onSave={(value) => handleUpdateField('externalId', value)}
                  placeholder="External system ID"
                  emptyText="Add external ID"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Gender</label>
                <InlineSelectEdit
                  value={donor.gender || null}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                  onSave={(value) => handleUpdateField('gender', value)}
                  emptyText="Not specified"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Is Couple</label>
                <InlineToggleEdit
                  value={donor.isCouple || false}
                  onSave={(value) => handleUpdateField('isCouple', value)}
                  trueText="Yes"
                  falseText="No"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">High Potential Donor</label>
                <InlineToggleEdit
                  value={donor.highPotentialDonor || false}
                  onSave={(value) => handleUpdateField('highPotentialDonor', value)}
                  trueText="High Potential"
                  falseText="Standard"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Donations, Communications, and Research Tabs */}
      <Tabs defaultValue="donations" className="space-y-4" style={{ listStyle: 'none' }}>
        <TabsList>
          <TabsTrigger value="donations">Donations ({donationCount})</TabsTrigger>
          <TabsTrigger value="communications">Communications ({communicationCount})</TabsTrigger>
          {/* Research tab hidden
          <TabsTrigger value="research">Research {hasResearch && <span className="ml-1 text-xs">✓</span>}</TabsTrigger>
          */}
        </TabsList>

        <TabsContent value="donations">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Donation History</CardTitle>
                <div className="flex items-center gap-2">
                  <Dialog open={donationDialogOpen} onOpenChange={setDonationDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Donation
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]" style={{ listStyle: 'none' }}>
                      <DialogHeader>
                        <DialogTitle>Add New Donation</DialogTitle>
                      </DialogHeader>
                      <Form {...donationForm}>
                        <form
                          onSubmit={donationForm.handleSubmit(onSubmitDonation)}
                          className="space-y-6"
                          style={{ listStyle: 'none' }}
                        >
                          <FormField
                            control={donationForm.control}
                            name="projectId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Project</FormLabel>
                                <Select
                                  onValueChange={(value) => field.onChange(Number(value))}
                                  value={field.value?.toString()}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a project" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {projectsResponse?.projects?.map((project) => (
                                      <SelectItem key={project.id} value={project.id.toString()}>
                                        {project.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={donationForm.control}
                            name="amount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amount ($)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.00"
                                    value={field.value || ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value === '' ? 0 : parseFloat(value));
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={donationForm.control}
                            name="date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                  <Input
                                    type="date"
                                    value={
                                      field.value ? field.value.toISOString().split('T')[0] : ''
                                    }
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      field.onChange(value ? new Date(value) : null);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end space-x-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setDonationDialogOpen(false)}
                              disabled={createDonationMutation.isPending}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={createDonationMutation.isPending}>
                              {createDonationMutation.isPending ? 'Adding...' : 'Add Donation'}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(Number(value) as typeof pageSize);
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select page size" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size.toString()}>
                          {size} items per page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isDonationsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : donations.length > 0 ? (
                <DataTable
                  columns={donationColumns}
                  data={donations}
                  totalItems={totalCount}
                  pageSize={pageSize}
                  pageCount={getPageCount(totalCount)}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size: number) => setPageSize(size as 10 | 20 | 50 | 100)}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No donations found for this donor.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle>Communication History</CardTitle>
            </CardHeader>
            <CardContent>
              {isCommunicationsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : communications.length > 0 ? (
                <DataTable
                  columns={communicationColumns}
                  data={communications}
                  totalItems={communications.length}
                  pageSize={pageSize}
                  pageCount={Math.ceil(communications.length / pageSize)}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size: number) => setPageSize(size as 10 | 20 | 50 | 100)}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No communications found for this donor.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Research tab content hidden
        <TabsContent value="research">
          <DonorResearchDisplay donorId={donorId} donorName={formatDonorName(donor)} />
        </TabsContent>
        */}
      </Tabs>
    </div>
  );
}
