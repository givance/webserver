"use client";

import React, { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Eye, Trash2, Mail, Send, FileText } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useCommunications } from "@/app/hooks/use-communications";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/app/lib/trpc/client";

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
  sentEmails: number;
  totalEmails: number;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: CommunicationJob | null;
  action: "draft" | "send" | "delete";
  onConfirm: (sendType?: "all" | "unsent") => void;
  isLoading: boolean;
  userEmail: string | null;
}

function ConfirmationDialog({
  open,
  onOpenChange,
  job,
  action,
  onConfirm,
  isLoading,
  userEmail,
}: ConfirmationDialogProps) {
  const [sendType, setSendType] = useState<"all" | "unsent">("unsent");

  if (!job) return null;

  const actionText = action === "draft" ? "save as drafts" : action === "send" ? "send" : "delete";
  const actionTitle = action === "draft" ? "Save to Draft" : action === "send" ? "Send Emails" : "Delete Job";

  const unsentCount = job.totalEmails - job.sentEmails;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>Please confirm the details before proceeding.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Job:</span>
              <span>{job.jobName}</span>
            </div>
            {action !== "delete" && (
              <>
                <div className="flex justify-between">
                  <span className="font-medium">Total emails:</span>
                  <span>{job.totalEmails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Sent emails:</span>
                  <span>{job.sentEmails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Unsent emails:</span>
                  <span>{unsentCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Gmail account:</span>
                  <span className="text-sm text-muted-foreground">{userEmail || "Not connected"}</span>
                </div>

                {action === "send" && (
                  <div className="space-y-3">
                    <div className="font-medium">Send options:</div>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="sendType"
                          value="unsent"
                          checked={sendType === "unsent"}
                          onChange={(e) => setSendType(e.target.value as "all" | "unsent")}
                          className="form-radio"
                        />
                        <span>Send only unsent emails ({unsentCount} emails)</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="sendType"
                          value="all"
                          checked={sendType === "all"}
                          onChange={(e) => setSendType(e.target.value as "all" | "unsent")}
                          className="form-radio"
                        />
                        <span>Resend all emails ({job.totalEmails} emails)</span>
                      </label>
                    </div>
                  </div>
                )}

                {action === "draft" && (
                  <div className="flex justify-between">
                    <span className="font-medium">Action:</span>
                    <span>Will save {job.totalEmails} emails as drafts</span>
                  </div>
                )}
              </>
            )}
            {action === "delete" && (
              <div className="flex justify-between">
                <span className="font-medium">Action:</span>
                <span>Will permanently delete this communication job and all associated emails</span>
              </div>
            )}
          </div>

          {action === "send" && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm text-orange-800">
                ⚠️ <strong>Warning:</strong> This will send {sendType === "all" ? job.totalEmails : unsentCount} emails
                immediately. This action cannot be undone.
              </p>
            </div>
          )}

          {action === "delete" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                ⚠️ <strong>Warning:</strong> This will permanently delete the communication job &quot;{job.jobName}
                &quot; and all {job.totalEmails} associated generated emails. This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(action === "send" ? sendType : undefined)} disabled={isLoading}>
            {isLoading ? "Processing..." : actionTitle}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PAGE_SIZE = 20;

function CommunicationJobsContent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    job: CommunicationJob | null;
    action: "draft" | "send" | "delete";
  }>({ open: false, job: null, action: "draft" });

  const {
    listJobs,
    saveToDraft,
    sendEmails,
    sendBulkEmails,
    deleteJob,
    isSavingToDraft,
    isSendingEmails,
    isSendingBulkEmails,
    isDeletingJob,
  } = useCommunications();

  // Get Gmail connection status
  const { data: gmailStatus } = trpc.gmail.getGmailConnectionStatus.useQuery();

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

  const handleDeleteJob = (job: CommunicationJob) => {
    setConfirmationDialog({ open: true, job, action: "delete" });
  };

  const handleSaveToDraft = (job: CommunicationJob) => {
    if (!gmailStatus?.isConnected) {
      toast.error("Please connect your Gmail account first in Settings");
      return;
    }
    setConfirmationDialog({ open: true, job, action: "draft" });
  };

  const handleSendEmails = (job: CommunicationJob) => {
    if (!gmailStatus?.isConnected) {
      toast.error("Please connect your Gmail account first in Settings");
      return;
    }
    setConfirmationDialog({ open: true, job, action: "send" });
  };

  const handleConfirmAction = async (sendType?: "all" | "unsent") => {
    const { job, action } = confirmationDialog;
    if (!job) return;

    try {
      let result;
      if (action === "draft") {
        result = await saveToDraft(job.id);
        if (result) {
          toast.success(result.message);
        } else {
          toast.error("Failed to save emails as drafts");
        }
      } else if (action === "send") {
        const typeToSend = sendType || "unsent";
        result = await sendBulkEmails(job.id, typeToSend);
        if (result) {
          toast.success(result.message);
        } else {
          toast.error("Failed to send emails");
        }
      } else if (action === "delete") {
        result = await deleteJob(job.id);
        if (result) {
          toast.success(`Communication job "${job.jobName}" has been deleted successfully`);
        } else {
          toast.error("Failed to delete communication job");
        }
      }
    } catch (error) {
      toast.error("An error occurred while processing your request");
    } finally {
      setConfirmationDialog({ open: false, job: null, action: "draft" });
    }
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
      id: "emailStatus",
      header: "Email Status",
      cell: ({ row }) => {
        const job = row.original;
        const sentPercentage = job.totalEmails > 0 ? (job.sentEmails / job.totalEmails) * 100 : 0;
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                {job.sentEmails}/{job.totalEmails} sent
              </span>
              <span>{Math.round(sentPercentage)}%</span>
            </div>
            <Progress value={sentPercentage} className="h-2" />
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
        const canSendOrDraft = job.status === "COMPLETED" && job.totalDonors > 0;

        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/campaign/results/${job.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {canSendOrDraft && (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleSaveToDraft(job)} title="Save to Gmail Draft">
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSendEmails(job)}
                  title="Send via Gmail"
                  className="text-blue-600 hover:text-blue-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </>
            )}
            {job.status === "FAILED" && (
              <Button variant="ghost" size="sm" onClick={() => handleRetryJob(job.id)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteJob(job)}
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
          <Link href="/campaign">
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
            <Link href="/campaign">
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

      <ConfirmationDialog
        open={confirmationDialog.open}
        onOpenChange={(open) => setConfirmationDialog((prev) => ({ ...prev, open }))}
        job={confirmationDialog.job}
        action={confirmationDialog.action}
        onConfirm={handleConfirmAction}
        isLoading={isSavingToDraft || isSendingEmails || isSendingBulkEmails || isDeletingJob}
        userEmail={gmailStatus?.email || null}
      />
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
