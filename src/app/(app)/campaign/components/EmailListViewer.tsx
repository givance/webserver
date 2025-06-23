"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, X, ChevronLeft, ChevronRight, Mail, Eye, Check, Clock, RefreshCw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailDisplay } from "./EmailDisplay";
import Link from "next/link";

// Base email interface that both components can extend
export interface BaseGeneratedEmail {
  donorId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
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
  showStaffAssignment = false,
  showSendButton = true,
  showEditButton = false,
  emailsPerPage = 20,
  maxHeight = "calc(100vh - 400px)",
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
      .map((item) => item.piece)
      .join(" ")
      .toLowerCase();
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
                disabled={isRegenerating}
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
              className="grid grid-cols-[320px_1fr] h-full border rounded-lg overflow-hidden"
              style={{ height: maxHeight, minHeight: "500px" }}
            >
              <div className="border-r bg-background flex flex-col h-full">
                <div className="p-3 border-b bg-muted/30 flex-shrink-0">
                  <h3 className="font-medium text-sm text-muted-foreground">
                    Recipients ({paginatedEmails.length}
                    {showPagination && safeFilteredEmails.length !== paginatedEmails.length
                      ? ` of ${filteredEmails.length}`
                      : ""}
                    )
                  </h3>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <ScrollArea className="h-full">
                    <TabsList className="flex flex-col w-full h-auto bg-transparent p-2 space-y-1">
                      {paginatedEmails.map((email) => {
                        const donor = getDonorData(email.donorId);
                        const trackingStatsData = showTracking ? getDonorTrackingStats(email.donorId) : null;
                        if (!donor) return null;

                        const assignedStaffName =
                          showStaffAssignment && getStaffName ? getStaffName(donor.assignedToStaffId || null) : null;

                        return (
                          <TabsTrigger
                            key={email.donorId}
                            value={email.donorId.toString()}
                            className={cn(
                              "w-full p-3 rounded-md border border-transparent",
                              "flex flex-col items-start justify-start gap-2",
                              "text-left min-h-[72px] h-auto",
                              "transition-all duration-200",
                              "hover:bg-muted/50 hover:border-border",
                              "data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20",
                              "data-[state=active]:shadow-sm"
                            )}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-sm truncate flex-1">
                                {formatDonorName(donor)}
                              </span>
                              <div className="flex items-center gap-1">
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
                              {assignedStaffName && (
                                <span className="text-xs text-muted-foreground font-medium">{assignedStaffName}</span>
                              )}
                              <span className="text-xs text-muted-foreground/80 truncate block w-full">
                                {donor.email}
                              </span>
                            </div>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </ScrollArea>
                </div>

                {/* Pagination moved to bottom of left panel */}
                {showPagination && totalPages > 1 && (
                  <div className="p-3 border-t bg-muted/30 flex-shrink-0">
                    <div className="flex flex-col space-y-2">
                      <p className="text-xs text-muted-foreground text-center">
                        {startIndex + 1}-{Math.min(endIndex, safeFilteredEmails.length)} of {safeFilteredEmails.length}
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
                  </div>
                )}
              </div>

              <div className="flex flex-col h-full" style={{ maxHeight: maxHeight }}>
                {paginatedEmails.map((email) => {
                  const donor = getDonorData(email.donorId);
                  if (!donor) return null;

                  const staffDetails = getStaffDetails ? getStaffDetails(donor.assignedToStaffId || null) : null;
                  const hasLinkedEmail = !!(staffDetails?.gmailToken);
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
