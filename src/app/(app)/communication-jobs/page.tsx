"use client";

import React, { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

interface CommunicationJob {
  id: number;
  jobName: string;
  status: string;
  totalDonors: number;
  completedDonors: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

const DEFAULT_PAGE_SIZE = 20;

function CommunicationJobsContent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { listJobs } = useCommunications();

  const {
    data: jobsResponse,
    isLoading,
    error,
  } = listJobs({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  });

  const jobs = jobsResponse?.jobs || [];
  const totalCount = jobsResponse?.totalCount || 0;

  const getStatusBadge = (status: CommunicationJob["status"]) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary">Pending</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="default">In Progress</Badge>;
      case "COMPLETED":
        return (
          <Badge variant="outline" className="border-green-500 text-green-700">
            Completed
          </Badge>
        );
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getProgressPercentage = (job: CommunicationJob) => {
    if (job.totalDonors === 0) return 0;
    return (job.completedDonors / job.totalDonors) * 100;
  };

  const handleRetryJob = async (jobId: number) => {
    // TODO: Implement retry functionality
    toast.success("Job retry functionality will be implemented soon");
  };

  const handleDeleteJob = async (jobId: number) => {
    // TODO: Implement delete functionality
    toast.success("Job delete functionality will be implemented soon");
  };

  const columns: ColumnDef<CommunicationJob>[] = [
    {
      accessorKey: "jobName",
      header: "Job Name",
      cell: ({ row }) => <div className="font-medium">{row.getValue("jobName")}</div>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => getStatusBadge(row.getValue("status")),
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => {
        const job = row.original;
        const percentage = getProgressPercentage(job);
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                {job.completedDonors}/{job.totalDonors} donors
              </span>
              <span>{Math.round(percentage)}%</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        return <div>{date.toLocaleDateString()}</div>;
      },
    },
    {
      accessorKey: "completedAt",
      header: "Completed",
      cell: ({ row }) => {
        const completedAt = row.getValue("completedAt") as string | undefined;
        if (!completedAt) return <div className="text-muted-foreground">-</div>;
        const date = new Date(completedAt);
        return <div>{date.toLocaleDateString()}</div>;
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/communicate/results/${job.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {job.status === "FAILED" && (
              <Button variant="ghost" size="sm" onClick={() => handleRetryJob(job.id)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteJob(job.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading communication jobs</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      <title>Communication Jobs</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Communication Jobs</h1>
            <p className="text-muted-foreground">Manage and track your email generation campaigns</p>
          </div>
          <Link href="/communicate">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Communication Job
            </Button>
          </Link>
        </div>

        {isLoading && !jobs.length ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              No communication jobs found. Start by creating your first campaign.
            </div>
            <Link href="/communicate">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Job
              </Button>
            </Link>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={jobs}
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </>
  );
}

export default function CommunicationJobsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto py-6">Loading...</div>}>
      <CommunicationJobsContent />
    </Suspense>
  );
}
