"use client";

import { useCommunications } from "@/app/hooks/use-communications";
import { useDonations } from "@/app/hooks/use-donations";
import { useDonors } from "@/app/hooks/use-donors";
import { useStaffMembers } from "@/app/hooks/use-staff-members";
import { useDonorJourneyStages } from "@/app/hooks/use-donor-journey-stages";
import { usePagination, PAGE_SIZE_OPTIONS } from "@/app/hooks/use-pagination";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { formatCurrency } from "@/app/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineTextEdit, InlineSelectEdit, InlineToggleEdit } from "@/components/ui/inline-edit";
import { ColumnDef } from "@tanstack/react-table";
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
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { DonorResearchDisplay } from "@/components/research/DonorResearchDisplay";
import { useDonorResearchData } from "@/app/hooks/use-donor-research";
import { toast } from "sonner";

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
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } = usePagination();

  // Notes editing state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  // Fetch donor data
  const { getDonorQuery, updateDonor, getDonorStats } = useDonors();
  const { data: donor, isLoading: isDonorLoading, error: donorError } = getDonorQuery(donorId);
  
  // Fetch staff members for assignment dropdown
  const { data: staffMembers = [] } = useStaffMembers();
  
  // Fetch donor journey stages
  const { donorJourneyStagesQuery } = useDonorJourneyStages();
  const { data: donorJourneyStages = [] } = donorJourneyStagesQuery;

  // Fetch donor stats for summary cards
  const { data: donorStats } = getDonorStats(donorId);

  // Fetch donor donations with proper pagination
  const { list: listDonations } = useDonations();
  const { data: donationsResponse, isLoading: isDonationsLoading } = listDonations({
    donorId,
    includeDonor: false,
    includeProject: true,
    limit: pageSize,
    offset: getOffset(),
    orderBy: "date",
    orderDirection: "desc",
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

  // Initialize notes value when donor loads
  useEffect(() => {
    if (donor?.notes) {
      setNotesValue(donor.notes);
    }
  }, [donor?.notes]);
  
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
    if (!email) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Invalid email format";
    return null;
  };
  
  const validatePhone = (phone: string): string | null => {
    if (!phone) return null; // Phone is optional
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
    if (!phoneRegex.test(phone)) return "Invalid phone format";
    return null;
  };
  
  const validateName = (name: string): string | null => {
    if (!name || name.length < 2) return "Name must be at least 2 characters";
    return null;
  };

  // Handle notes editing
  const handleStartEditingNotes = () => {
    setNotesValue(donor?.notes || "");
    setIsEditingNotes(true);
  };

  const handleCancelEditingNotes = () => {
    setNotesValue(donor?.notes || "");
    setIsEditingNotes(false);
  };

  const handleSaveNotes = async () => {
    try {
      await updateDonor({
        id: donorId,
        notes: notesValue.trim() || undefined,
      });
      setIsEditingNotes(false);
    } catch (error) {
      console.error("Failed to update notes:", error);
      // TODO: Add toast notification for error
    }
  };

  // Process donations data
  const { donations, totalDonated, donationCount, totalCount } = useMemo(() => {
    if (!donationsResponse?.donations) {
      return { donations: [], totalDonated: 0, donationCount: 0, totalCount: 0 };
    }

    const donationItems: DonationRow[] = donationsResponse.donations.map((donation) => ({
      id: donation.id,
      date: new Date(donation.date).toISOString(),
      amount: donation.amount,
      projectId: donation.project?.id || 0,
      projectName: donation.project?.name || "Unknown Project",
      status: "completed", // Assuming all donations are completed
    }));

    // For current page donations, calculate the total from current page
    const currentPageTotal = donationsResponse.donations.reduce((sum, donation) => sum + donation.amount, 0);

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
      latestMessage: thread.content?.[0]?.content || "No messages",
      staff: thread.staff?.map((s) => `${s.staff?.firstName} ${s.staff?.lastName}`).filter(Boolean) || [],
    }));

    return {
      communications: communicationItems,
      communicationCount: communicationsResponse.threads.length,
    };
  }, [communicationsResponse]);

  // Define columns for donations table
  const donationColumns: ColumnDef<DonationRow>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => new Date(row.getValue("date")).toLocaleDateString(),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => formatCurrency(row.getValue("amount")),
    },
    {
      accessorKey: "projectName",
      header: "Project",
      cell: ({ row }) => {
        const projectId = row.original.projectId;
        const projectName = row.getValue("projectName") as string;
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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("status") === "completed" ? "default" : "secondary"}>
          {row.getValue("status")}
        </Badge>
      ),
    },
  ];

  // Define columns for communications table
  const communicationColumns: ColumnDef<CommunicationRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleDateString(),
    },
    {
      accessorKey: "channel",
      header: "Channel",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.getValue("channel")}
        </Badge>
      ),
    },
    {
      accessorKey: "staff",
      header: "Staff",
      cell: ({ row }) => {
        const staff = row.getValue("staff") as string[];
        return staff.length > 0 ? staff.join(", ") : "Unassigned";
      },
    },
    {
      accessorKey: "latestMessage",
      header: "Latest Message",
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate" title={row.getValue("latestMessage")}>
          {row.getValue("latestMessage")}
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
          <h1 className="text-2xl font-bold text-red-600">{donorError ? "Error loading donor" : "Donor not found"}</h1>
        </div>
        <div className="text-muted-foreground">
          {donorError ? "There was an error loading the donor information." : "The requested donor could not be found."}
        </div>
      </div>
    );
  }

  const lastDonationDate = donorStats?.lastDonationDate ? new Date(donorStats.lastDonationDate) : null;

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
            <h1 className="text-2xl font-bold">{formatDonorName(donor)}</h1>
            <p className="text-muted-foreground">{donor.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={conductResearch} disabled={isConductingResearch}>
            <Search className="h-4 w-4 mr-2" />
            {isConductingResearch ? "Researching..." : "Research"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/donors/email/${donorId}`}>
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/communications?donorId=${donorId}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              View Communications
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(donorStats?.totalDonated || 0)}</div>
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
              {lastDonationDate ? lastDonationDate.toLocaleDateString() : "Never"}
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
                onSave={(value) => handleUpdateField("email", value)}
                type="email"
                validation={validateEmail}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <InlineTextEdit
                value={donor.phone || ""}
                onSave={(value) => handleUpdateField("phone", value)}
                type="tel"
                validation={validatePhone}
                emptyText="Add phone number"
                className="flex-1"
              />
            </div>
            <div className="flex items-start gap-2 md:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
              <div className="flex-1">
                <InlineTextEdit
                  value={donor.address || ""}
                  onSave={(value) => handleUpdateField("address", value)}
                  placeholder="Enter address"
                  emptyText="Add address"
                  className="mb-2"
                />
                <InlineTextEdit
                  value={donor.state || ""}
                  onSave={(value) => handleUpdateField("state", value)}
                  placeholder="State"
                  emptyText="Add state"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Notes</h4>
              {!isEditingNotes ? (
                <Button variant="ghost" size="sm" onClick={handleStartEditingNotes} className="h-8 px-2">
                  <Edit className="h-4 w-4" />
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveNotes}
                    className="h-8 px-2 text-green-600 hover:text-green-700"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEditingNotes}
                    className="h-8 px-2 text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {isEditingNotes ? (
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes about this donor..."
                className="min-h-[100px]"
                autoFocus
              />
            ) : (
              <p className="text-muted-foreground min-h-[24px]">{donor.notes || "No notes added yet."}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Donor Details & Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Donor Details & Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">First Name</label>
                <InlineTextEdit
                  value={donor.firstName}
                  onSave={(value) => handleUpdateField("firstName", value)}
                  validation={validateName}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Last Name</label>
                <InlineTextEdit
                  value={donor.lastName}
                  onSave={(value) => handleUpdateField("lastName", value)}
                  validation={validateName}
                />
              </div>
              {donor.displayName && (
                <div className="md:col-span-2">
                  <label className="text-sm text-muted-foreground">Display Name</label>
                  <InlineTextEdit
                    value={donor.displayName}
                    onSave={(value) => handleUpdateField("displayName", value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Couple Information (if applicable) */}
          {donor.isCouple && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Couple Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h5 className="text-sm font-medium">His Information</h5>
                  <div>
                    <label className="text-sm text-muted-foreground">Title</label>
                    <InlineTextEdit
                      value={donor.hisTitle || ""}
                      onSave={(value) => handleUpdateField("hisTitle", value)}
                      placeholder="Mr., Dr., Rabbi, etc."
                      emptyText="Add title"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">First Name</label>
                    <InlineTextEdit
                      value={donor.hisFirstName || ""}
                      onSave={(value) => handleUpdateField("hisFirstName", value)}
                      emptyText="Add first name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Name</label>
                    <InlineTextEdit
                      value={donor.hisLastName || ""}
                      onSave={(value) => handleUpdateField("hisLastName", value)}
                      emptyText="Add last name"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-sm font-medium">Her Information</h5>
                  <div>
                    <label className="text-sm text-muted-foreground">Title</label>
                    <InlineTextEdit
                      value={donor.herTitle || ""}
                      onSave={(value) => handleUpdateField("herTitle", value)}
                      placeholder="Mrs., Ms., Dr., etc."
                      emptyText="Add title"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">First Name</label>
                    <InlineTextEdit
                      value={donor.herFirstName || ""}
                      onSave={(value) => handleUpdateField("herFirstName", value)}
                      emptyText="Add first name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Name</label>
                    <InlineTextEdit
                      value={donor.herLastName || ""}
                      onSave={(value) => handleUpdateField("herLastName", value)}
                      emptyText="Add last name"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Management */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Management</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Assigned Staff</label>
                <InlineSelectEdit
                  value={donor.assignedToStaffId ? String(donor.assignedToStaffId) : null}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...staffMembers.map(staff => ({
                      value: String(staff.id),
                      label: `${staff.firstName} ${staff.lastName}`
                    }))
                  ]}
                  onSave={async (value) => {
                    await handleUpdateField("assignedToStaffId", value ? Number(value) : null);
                  }}
                  emptyText="Unassigned"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Donor Journey Stage</label>
                <InlineSelectEdit
                  value={donor.currentStageName || null}
                  options={donorJourneyStages.map(stage => ({
                    value: stage.name,
                    label: stage.name
                  }))}
                  onSave={(value) => handleUpdateField("currentStageName", value)}
                  emptyText="No stage set"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">High Potential Donor</label>
                <InlineToggleEdit
                  value={donor.highPotentialDonor || false}
                  onSave={(value) => handleUpdateField("highPotentialDonor", value)}
                  trueText="High Potential"
                  falseText="Standard"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Donations, Communications, and Research Tabs */}
      <Tabs defaultValue="donations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="donations">Donations ({donationCount})</TabsTrigger>
          <TabsTrigger value="communications">Communications ({communicationCount})</TabsTrigger>
          <TabsTrigger value="research">Research {hasResearch && <span className="ml-1 text-xs">✓</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="donations">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Donation History</CardTitle>
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
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">No donations found for this donor.</div>
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
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">No communications found for this donor.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="research">
          <DonorResearchDisplay donorId={donorId} donorName={formatDonorName(donor)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
