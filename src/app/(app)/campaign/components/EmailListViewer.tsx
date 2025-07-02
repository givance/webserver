"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Mail,
  Eye,
  Check,
  Clock,
  RefreshCw,
  Plus,
  AlertCircle,
  DollarSign,
  Calendar,
  Hash,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailDisplay } from "./EmailDisplay";
import Link from "next/link";
import { trpc } from "@/app/lib/trpc/client";

// Base email interface that both components can extend
export interface BaseGeneratedEmail {
  donorId: number;
  subject: string;
  // Legacy format fields (for backward compatibility - optional for new emails)
  structuredContent?: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts?: Record<string, string>;
  // New format fields (for new generation)
  emailContent?: string; // Plain text email content
  reasoning?: string; // AI's reasoning for the email generation
  id?: number; // Optional for campaign results
  status?: "PENDING_APPROVAL" | "APPROVED"; // Approval status
}

// Base donor interface
export interface BaseDonor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  assignedToStaffId?: number | null;
}

// Tracking stats interface (optional, for campaign results)
export interface TrackingStats {
  donorId: number;
  uniqueOpens: number;
}

// Staff interface for email display
export interface StaffDetails {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  gmailToken?: { id: number; email: string } | null;
}

// Props for the EmailListViewer component
export interface EmailListViewerProps {
  emails: BaseGeneratedEmail[];
  donors: BaseDonor[];
  referenceContexts: Record<number, Record<string, string>>;

  // Optional features
  showSearch?: boolean;
  showPagination?: boolean;
  showTracking?: boolean;
  showStaffAssignment?: boolean;
  showSendButton?: boolean; // Control whether to show send buttons in EmailDisplay
  showEditButton?: boolean; // Control whether to show edit buttons in EmailDisplay
  emailsPerPage?: number;
  maxHeight?: string;
  showDonorTooltips?: boolean; // Control whether to show donor info tooltips

  // Optional data for enhanced features
  trackingStats?: TrackingStats[];
  getStaffName?: (staffId: number | null) => string;
  getStaffDetails?: (staffId: number | null) => StaffDetails | null;
  primaryStaff?: StaffDetails | null;
  sessionId?: number; // For EmailDisplay props

  // Search functionality
  searchPlaceholder?: string;
  getSearchableText?: (email: BaseGeneratedEmail, donor: BaseDonor) => string;

  // Empty states
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  searchEmptyStateTitle?: string;
  searchEmptyStateDescription?: string;

  // Approval functionality
  onEmailStatusChange?: (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => void;
  isUpdatingStatus?: boolean;

  // Preview mode callbacks
  onPreviewEdit?: (
    donorId: number,
    subject: string,
    content: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>
  ) => void;
  onPreviewEnhance?: (donorId: number, instruction: string) => void;

  // Regenerate and generate more functionality
  showRegenerateButton?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  canGenerateMore?: boolean;
  onGenerateMore?: () => void;
  isGeneratingMore?: boolean;
  remainingDonorsCount?: number;
  generateMoreCount?: number;
}

export function EmailListViewer({
  emails,
  donors,
  referenceContexts,
  showSearch = true,
  showPagination = true,
  showTracking = false,
  showStaffAssignment = true,
  showSendButton = true,
  showEditButton = false,
  emailsPerPage = 20,
  maxHeight = "calc(100vh - 400px)",
  showDonorTooltips = true,
  trackingStats = [],
  getStaffName,
  getStaffDetails,
  primaryStaff,
  sessionId,
  searchPlaceholder = "Search emails by recipient, subject, or content...",
  getSearchableText,
  emptyStateTitle = "No emails generated",
  emptyStateDescription = "No emails have been generated yet.",
  searchEmptyStateTitle = "No emails found",
  searchEmptyStateDescription = "No emails match your search criteria.",
  onEmailStatusChange,
  isUpdatingStatus = false,
  onPreviewEdit,
  onPreviewEnhance,
  showRegenerateButton = false,
  onRegenerate,
  isRegenerating = false,
  canGenerateMore = false,
  onGenerateMore,
  isGeneratingMore = false,
  remainingDonorsCount = 0,
  generateMoreCount = 0,
}: EmailListViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingDonations, setLoadingDonations] = useState<Record<number, boolean>>({});
  const [donorDonations, setDonorDonations] = useState<
    Record<number, { donations: any[]; totalCount: number; totalAmount: number }>
  >({});
  const [isRecipientsCollapsed, setIsRecipientsCollapsed] = useState(true); // Collapsed by default

  const utils = trpc.useUtils();

  // Helper function to get donor data
  const getDonorData = useCallback(
    (donorId: number) => {
      return donors?.find((donor) => donor.id === donorId);
    },
    [donors]
  );

  // Helper function to get tracking stats
  const getDonorTrackingStats = useCallback(
    (donorId: number) => {
      return trackingStats?.find((stats) => stats.donorId === donorId);
    },
    [trackingStats]
  );

  // Default searchable text extractor
  const defaultGetSearchableText = useCallback((email: BaseGeneratedEmail, donor: BaseDonor) => {
    const emailContent = email.structuredContent
      ? email.structuredContent
          .map((item) => item.piece)
          .join(" ")
          .toLowerCase()
      : email.emailContent?.toLowerCase() || "";
    const donorName = `${donor.firstName} ${donor.lastName}`.toLowerCase();
    const donorEmail = donor.email.toLowerCase();
    const subject = email.subject.toLowerCase();

    return `${donorName} ${donorEmail} ${subject} ${emailContent}`;
  }, []);

  // Filter emails based on search term
  const filteredEmails = useMemo(() => {
    if (!searchTerm.trim()) {
      return emails || [];
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const textExtractor = getSearchableText || defaultGetSearchableText;

    return (emails || []).filter((email) => {
      const donor = getDonorData(email.donorId);
      if (!donor) return false;

      const searchableText = textExtractor(email, donor);
      return searchableText.includes(searchLower);
    });
  }, [emails, searchTerm, getDonorData, getSearchableText, defaultGetSearchableText]);

  // Pagination logic
  const safeFilteredEmails = filteredEmails || [];
  const totalPages = Math.ceil(safeFilteredEmails.length / emailsPerPage);
  const startIndex = (currentPage - 1) * emailsPerPage;
  const endIndex = startIndex + emailsPerPage;
  const paginatedEmails = showPagination ? safeFilteredEmails.slice(startIndex, endIndex) : safeFilteredEmails;

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Format donor name
  const formatDonorName = (donor: BaseDonor) => {
    return `${donor.firstName} ${donor.lastName}`;
  };

  // Get donor initials for collapsed view
  const getDonorInitials = (donor: BaseDonor) => {
    return `${donor.firstName.charAt(0)}${donor.lastName.charAt(0)}`.toUpperCase();
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  };

  // Format date
  const formatDate = (date: string | Date) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const loadDonorDonations = useCallback(
    async (donorId: number) => {
      if (loadingDonations[donorId] || donorDonations[donorId]) return;

      setLoadingDonations((prev) => ({ ...prev, [donorId]: true }));

      try {
        // Get accurate donation statistics
        const statsResult = await utils.donations.getDonorStats.fetch({ donorId });

        // Get recent donations for display
        const donationsResult = await utils.donations.list.fetch({
          donorId,
          limit: 20,
          orderBy: "date",
          orderDirection: "desc",
          includeProject: true,
        });

        if (statsResult && donationsResult) {
          setDonorDonations((prev) => ({
            ...prev,
            [donorId]: {
              donations: donationsResult.donations,
              totalCount: donationsResult.totalCount, // Total count of all donations
              totalAmount: statsResult.totalDonated, // Accurate total amount from stats
            },
          }));
        }
      } catch (error) {
        console.error("Failed to load donations:", error);
      } finally {
        setLoadingDonations((prev) => ({ ...prev, [donorId]: false }));
      }
    },
    [utils.donations.list, utils.donations.getDonorStats, loadingDonations, donorDonations]
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Search Bar with Regenerate buttons - Made smaller and less intrusive */}
      {showSearch && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="relative max-w-sm">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-7 pr-8 h-8 text-sm"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={clearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {searchTerm && (
              <p className="text-xs text-muted-foreground mt-1">
                {safeFilteredEmails.length} result{safeFilteredEmails.length !== 1 ? "s" : ""} found for &quot;
                {searchTerm}&quot;
              </p>
            )}
          </div>

          {/* Regenerate and Generate More buttons */}
          <div className="flex items-center gap-2">
            {showRegenerateButton && onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || emails.length === 0}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </Button>
            )}
            {canGenerateMore && onGenerateMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateMore}
                disabled={isGeneratingMore}
                className="flex items-center gap-2"
              >
                <Plus className="h-3 w-3" />
                {isGeneratingMore
                  ? "Generating..."
                  : `Generate ${Math.min(generateMoreCount, remainingDonorsCount)} More`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Email List */}
      <div className="flex-1 min-h-0">
        {paginatedEmails.length > 0 ? (
          <Tabs
            defaultValue={paginatedEmails[0]?.donorId?.toString()}
            orientation="vertical"
            className="h-full"
            key={`search-${searchTerm}-page-${currentPage}-${paginatedEmails.length}`}
          >
            <div
              className={cn(
                "grid border rounded-lg overflow-hidden transition-all duration-300 h-full",
                isRecipientsCollapsed ? "grid-cols-[80px_1fr]" : "grid-cols-[320px_1fr]"
              )}
            >
              <div className="border-r bg-background h-full overflow-y-auto">
                <div className="flex flex-col min-h-full">
                  <div className="p-3 border-b bg-muted/30 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      {isRecipientsCollapsed ? (
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium text-muted-foreground">{paginatedEmails.length}</span>
                        </div>
                      ) : (
                        <h3 className="font-medium text-sm text-muted-foreground">
                          Recipients ({paginatedEmails.length}
                          {showPagination && safeFilteredEmails.length !== paginatedEmails.length
                            ? ` of ${filteredEmails.length}`
                            : ""}
                          )
                        </h3>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsRecipientsCollapsed(!isRecipientsCollapsed)}
                        className="h-6 w-6 p-0"
                      >
                        {isRecipientsCollapsed ? (
                          <PanelLeftOpen className="h-3 w-3" />
                        ) : (
                          <PanelLeftClose className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <TabsList className="flex flex-col w-full h-auto bg-transparent p-2 space-y-1 flex-grow">
                    {paginatedEmails.map((email) => {
                      const donor = getDonorData(email.donorId);
                      const trackingStatsData = showTracking ? getDonorTrackingStats(email.donorId) : null;
                      if (!donor) return null;

                      const assignedStaffName =
                        showStaffAssignment && getStaffName ? getStaffName(donor.assignedToStaffId || null) : null;

                      // Get staff details to check email connection
                      const staffDetails =
                        showStaffAssignment && getStaffDetails
                          ? getStaffDetails(donor.assignedToStaffId || null)
                          : null;
                      const hasConnectedEmail = staffDetails?.gmailToken != null;

                      return (
                        <TabsTrigger
                          key={email.donorId}
                          value={email.donorId.toString()}
                          className={cn(
                            "w-full rounded-md border border-transparent",
                            "flex items-center justify-center gap-2",
                            "transition-all duration-200",
                            "hover:bg-muted/50 hover:border-border",
                            "data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20",
                            "data-[state=active]:shadow-sm",
                            "group relative",
                            isRecipientsCollapsed
                              ? "p-2 min-h-[48px] h-auto flex-col"
                              : "p-3 min-h-[72px] h-auto flex-col items-start justify-start"
                          )}
                        >
                          {isRecipientsCollapsed ? (
                            // Collapsed view - show initials and status
                            <>
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-semibold text-primary">{getDonorInitials(donor)}</span>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                {/* Approval status badge */}
                                {email.status === "APPROVED" ? (
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                )}
                                {/* Email connection error indicator */}
                                {showStaffAssignment && assignedStaffName && !hasConnectedEmail && (
                                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                )}
                                {trackingStatsData && trackingStatsData.uniqueOpens > 0 && (
                                  <span className="text-xs text-muted-foreground">{trackingStatsData.uniqueOpens}</span>
                                )}
                              </div>

                              {/* Tooltip with full information on hover */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="absolute inset-0 cursor-help"
                                    onMouseEnter={() => loadDonorDonations(donor.id)}
                                  />
                                </TooltipTrigger>
                                <TooltipContent
                                  side="right"
                                  align="start"
                                  className="max-w-sm p-0 bg-background border"
                                >
                                  <div className="p-4 space-y-3">
                                    <div className="font-semibold text-sm border-b pb-2">{formatDonorName(donor)}</div>

                                    <div className="space-y-3 text-sm">
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Email:</span>
                                        <br />
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                          {donor?.email || "No email"}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Staff:</span>
                                        <br />
                                        {assignedStaffName && assignedStaffName !== "Unassigned" ? (
                                          <div>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                              {assignedStaffName}
                                            </span>
                                            {!hasConnectedEmail && (
                                              <span className="text-red-500 text-xs ml-2">• No email connected</span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-gray-500 text-xs">No staff assigned</span>
                                        )}
                                      </div>
                                      {assignedStaffName &&
                                        assignedStaffName !== "Unassigned" &&
                                        staffDetails?.gmailToken?.email && (
                                          <div>
                                            <span className="text-gray-600 dark:text-gray-400">Staff Email:</span>
                                            <br />
                                            <span className="font-medium text-xs text-gray-900 dark:text-gray-100">
                                              {staffDetails.gmailToken.email}
                                            </span>
                                          </div>
                                        )}
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Status:</span>
                                        <br />
                                        {email.status === "APPROVED" ? (
                                          <Badge
                                            variant="default"
                                            className="text-xs inline-flex items-center gap-1 bg-green-500 mt-1"
                                          >
                                            <Check className="h-3 w-3" />
                                            Approved
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="secondary"
                                            className="text-xs inline-flex items-center gap-1 mt-1"
                                          >
                                            <Clock className="h-3 w-3" />
                                            Pending
                                          </Badge>
                                        )}
                                      </div>
                                    </div>

                                    {loadingDonations[donor.id] ? (
                                      <div className="text-sm text-muted-foreground">Loading donations...</div>
                                    ) : donorDonations[donor.id] ? (
                                      <>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <div className="text-gray-600 dark:text-gray-400">Total Donations</div>
                                            <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                              <Hash className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                              {donorDonations[donor.id].totalCount || 0}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-gray-600 dark:text-gray-400">Total Amount</div>
                                            <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                              <DollarSign className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                              {formatCurrency(donorDonations[donor.id].totalAmount || 0)}
                                            </div>
                                          </div>
                                        </div>

                                        {donorDonations[donor.id].donations.length > 0 && (
                                          <div className="space-y-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                              Recent Donations
                                            </div>
                                            <div className="max-h-48 overflow-y-auto space-y-1">
                                              {donorDonations[donor.id].donations
                                                .slice(0, 20)
                                                .map((donation: any, idx: number) => (
                                                  <div
                                                    key={idx}
                                                    className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <Calendar className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                                      <span className="text-gray-900 dark:text-gray-100">
                                                        {formatDate(donation.date)}
                                                      </span>
                                                      {donation.project && (
                                                        <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                                          • {donation.project.name}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                                      {formatCurrency(donation.amount)}
                                                    </span>
                                                  </div>
                                                ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-sm text-gray-600 dark:text-gray-400">No donations found</div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </>
                          ) : (
                            // Expanded view - show full information as before
                            <>
                              <div className="flex items-center justify-between w-full">
                                {showDonorTooltips ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild onMouseEnter={() => loadDonorDonations(donor.id)}>
                                      <span className="font-medium text-sm truncate flex-1 cursor-help hover:text-primary transition-colors flex items-center gap-1">
                                        {formatDonorName(donor)}
                                        <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="right"
                                      align="start"
                                      className="max-w-sm p-0 bg-background border"
                                    >
                                      <div className="p-4 space-y-3">
                                        <div className="font-semibold text-sm border-b pb-2">
                                          {formatDonorName(donor)}
                                        </div>

                                        {loadingDonations[donor.id] ? (
                                          <div className="text-sm text-muted-foreground">Loading donations...</div>
                                        ) : donorDonations[donor.id] ? (
                                          <>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                              <div>
                                                <div className="text-gray-600 dark:text-gray-400">Total Donations</div>
                                                <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                                  <Hash className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                                  {donorDonations[donor.id].totalCount || 0}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-gray-600 dark:text-gray-400">Total Amount</div>
                                                <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                                  <DollarSign className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                                  {formatCurrency(donorDonations[donor.id].totalAmount || 0)}
                                                </div>
                                              </div>
                                            </div>

                                            {donorDonations[donor.id].donations.length > 0 && (
                                              <div className="space-y-1">
                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                  Recent Donations
                                                </div>
                                                <div className="max-h-48 overflow-y-auto space-y-1">
                                                  {donorDonations[donor.id].donations
                                                    .slice(0, 20)
                                                    .map((donation: any, idx: number) => (
                                                      <div
                                                        key={idx}
                                                        className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                                                      >
                                                        <div className="flex items-center gap-2">
                                                          <Calendar className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                                                          <span className="text-gray-900 dark:text-gray-100">
                                                            {formatDate(donation.date)}
                                                          </span>
                                                          {donation.project && (
                                                            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                                              • {donation.project.name}
                                                            </span>
                                                          )}
                                                        </div>
                                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                                          {formatCurrency(donation.amount)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                </div>
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div className="text-sm text-gray-600 dark:text-gray-400">
                                            No donations found
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="font-medium text-sm truncate flex-1">{formatDonorName(donor)}</span>
                                )}
                                <div className="flex items-center gap-1">
                                  {/* Email connection error icon */}
                                  {showStaffAssignment && assignedStaffName && !hasConnectedEmail && (
                                    <Badge
                                      variant="destructive"
                                      className="text-xs flex items-center gap-1 px-1.5 py-0 h-5"
                                    >
                                      <AlertCircle className="h-3 w-3" />
                                    </Badge>
                                  )}
                                  {/* Approval status badge */}
                                  {email.status === "APPROVED" ? (
                                    <Badge variant="default" className="text-xs flex items-center gap-1 bg-green-500">
                                      <Check className="h-3 w-3" />
                                      Approved
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Pending
                                    </Badge>
                                  )}
                                  {trackingStatsData && trackingStatsData.uniqueOpens > 0 && (
                                    <Badge variant="secondary" className="text-xs flex items-center gap-1 ml-1">
                                      <Eye className="h-3 w-3" />
                                      {trackingStatsData.uniqueOpens}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="w-full space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">Donor email:</span>
                                  <span className="text-xs text-muted-foreground/80 truncate">{donor.email}</span>
                                </div>
                                {assignedStaffName && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Assigned staff:</span>
                                    <span className="text-xs text-muted-foreground font-medium">
                                      {assignedStaffName}
                                    </span>
                                    {!hasConnectedEmail && <span className="text-xs text-red-500">• No email</span>}
                                  </div>
                                )}
                                {assignedStaffName && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Assigned staff email:</span>
                                    <span className="text-xs text-muted-foreground/80 truncate">
                                      {hasConnectedEmail && staffDetails?.gmailToken?.email
                                        ? staffDetails.gmailToken.email
                                        : "No email connected"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {/* Pagination moved to bottom of left panel */}
                  {showPagination && totalPages > 1 && (
                    <div className="p-2 border-t bg-muted/30 flex-shrink-0">
                      {isRecipientsCollapsed ? (
                        // Collapsed pagination - more compact
                        <div className="flex flex-col items-center space-y-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="h-6 w-6 p-0"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground text-center">
                            {currentPage}/{totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="h-6 w-6 p-0"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        // Expanded pagination - full layout
                        <div className="flex flex-col space-y-2">
                          <p className="text-xs text-muted-foreground text-center">
                            {startIndex + 1}-{Math.min(endIndex, safeFilteredEmails.length)} of{" "}
                            {safeFilteredEmails.length}
                          </p>
                          <div className="flex items-center justify-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className="h-7 px-2"
                            >
                              <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {currentPage} / {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                              disabled={currentPage === totalPages}
                              className="h-7 px-2"
                            >
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col h-full overflow-hidden">
                {paginatedEmails.map((email) => {
                  const donor = getDonorData(email.donorId);
                  if (!donor) return null;

                  const staffDetails = getStaffDetails ? getStaffDetails(donor.assignedToStaffId || null) : null;
                  const hasLinkedEmail = !!staffDetails?.gmailToken;
                  const staffLinkedEmail = staffDetails?.gmailToken?.email || null;
                  const defaultEmail = primaryStaff?.gmailToken?.email || primaryStaff?.email || "organization default";

                  return (
                    <TabsContent
                      key={email.donorId}
                      value={email.donorId.toString()}
                      className="flex-1 m-0 data-[state=active]:flex flex-col h-full overflow-hidden"
                    >
                      <ScrollArea className="h-full">
                        <EmailDisplay
                          key={`${email.id || email.donorId}-${email.donorId}-${sessionId || "preview"}`}
                          donorName={formatDonorName(donor)}
                          donorEmail={donor.email}
                          subject={email.subject}
                          content={email.structuredContent}
                          referenceContexts={referenceContexts[email.donorId] || {}}
                          emailContent={email.emailContent}
                          reasoning={email.reasoning}
                          emailId={email.id}
                          donorId={email.donorId}
                          sessionId={sessionId}
                          showSendButton={showSendButton}
                          showEditButton={showEditButton}
                          approvalStatus={email.status}
                          onStatusChange={onEmailStatusChange}
                          isUpdatingStatus={isUpdatingStatus}
                          // Enable preview mode when there's no emailId
                          isPreviewMode={!email.id}
                          onPreviewEdit={!email.id && onPreviewEdit ? onPreviewEdit : undefined}
                          onPreviewEnhance={!email.id && onPreviewEnhance ? onPreviewEnhance : undefined}
                          onPreviewStatusChange={
                            !email.id && onEmailStatusChange
                              ? (donorId, status) => {
                                  // Create a temporary ID for status tracking
                                  onEmailStatusChange(donorId, status);
                                }
                              : undefined
                          }
                          // Staff information
                          staffName={staffDetails ? `${staffDetails.firstName} ${staffDetails.lastName}` : undefined}
                          staffEmail={staffLinkedEmail}
                          hasLinkedEmail={hasLinkedEmail}
                          defaultStaffEmail={defaultEmail}
                        />
                      </ScrollArea>
                    </TabsContent>
                  );
                })}
              </div>
            </div>
          </Tabs>
        ) : searchTerm ? (
          <div className="flex items-center justify-center h-full border rounded-lg">
            <div className="text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">{searchEmptyStateTitle}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchEmptyStateDescription.replace("{searchTerm}", searchTerm)}
              </p>
              <Button variant="outline" onClick={clearSearch}>
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full border rounded-lg">
            <div className="text-center">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">{emptyStateTitle}</h3>
              <p className="text-sm text-muted-foreground">{emptyStateDescription}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
