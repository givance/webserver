"use client";

import { useParams, useRouter } from "next/navigation";
import { useDonors } from "@/app/hooks/use-donors";
import { useDonations } from "@/app/hooks/use-donations";
import { useCommunications } from "@/app/hooks/use-communications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Mail, Phone, Calendar, DollarSign, MessageSquare, Activity } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { formatCurrency } from "@/app/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Fetch donor data
  const { getDonorQuery } = useDonors();
  const { data: donor, isLoading: isDonorLoading, error: donorError } = getDonorQuery(donorId);

  // Fetch donor donations
  const { list: listDonations } = useDonations();
  const { data: donationsResponse, isLoading: isDonationsLoading } = listDonations({
    donorId,
    includeDonor: false,
    includeProject: true,
    limit: 100, // Get all donations for now
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

  // Process donations data
  const { donations, totalDonated, donationCount } = useMemo(() => {
    if (!donationsResponse?.donations) {
      return { donations: [], totalDonated: 0, donationCount: 0 };
    }

    const donationItems: DonationRow[] = donationsResponse.donations.map((donation) => ({
      id: donation.id,
      date: new Date(donation.date).toISOString(),
      amount: donation.amount,
      projectId: donation.project?.id || 0,
      projectName: donation.project?.name || "Unknown Project",
      status: "completed", // Assuming all donations are completed
    }));

    const total = donationsResponse.donations.reduce((sum, donation) => sum + donation.amount, 0);

    return {
      donations: donationItems,
      totalDonated: total,
      donationCount: donationsResponse.donations.length,
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

  const lastDonationDate = donations.length > 0 ? new Date(donations[0].date) : null;

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
              {donor.firstName} {donor.lastName}
            </h1>
            <p className="text-muted-foreground">{donor.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
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
            <div className="text-2xl font-bold">{formatCurrency(totalDonated)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donations</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{donationCount}</div>
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
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{donor.email}</span>
            </div>
            {donor.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{donor.phone}</span>
              </div>
            )}
            {donor.address && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground">Address:</span>
                <span>
                  {donor.address}
                  {donor.state && `, ${donor.state}`}
                </span>
              </div>
            )}
          </div>
          {donor.notes && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Notes</h4>
              <p className="text-muted-foreground">{donor.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Donations and Communications Tabs */}
      <Tabs defaultValue="donations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="donations">Donations ({donationCount})</TabsTrigger>
          <TabsTrigger value="communications">Communications ({communicationCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="donations">
          <Card>
            <CardHeader>
              <CardTitle>Donation History</CardTitle>
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
                  totalItems={donations.length}
                  pageSize={pageSize}
                  pageCount={Math.ceil(donations.length / pageSize)}
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
      </Tabs>
    </div>
  );
}
