"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, X, ChevronLeft, ChevronRight, Mail, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailDisplay } from "./EmailDisplay";

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
  emailsPerPage?: number;
  maxHeight?: string;

  // Optional data for enhanced features
  trackingStats?: TrackingStats[];
  getStaffName?: (staffId: number | null) => string;
  sessionId?: number; // For EmailDisplay props

  // Search functionality
  searchPlaceholder?: string;
  getSearchableText?: (email: BaseGeneratedEmail, donor: BaseDonor) => string;

  // Empty states
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  searchEmptyStateTitle?: string;
  searchEmptyStateDescription?: string;
}

export function EmailListViewer({
  emails,
  donors,
  referenceContexts,
  showSearch = true,
  showPagination = true,
  showTracking = false,
  showStaffAssignment = false,
  emailsPerPage = 20,
  maxHeight = "calc(100vh - 400px)",
  trackingStats = [],
  getStaffName,
  sessionId,
  searchPlaceholder = "Search emails by recipient, subject, or content...",
  getSearchableText,
  emptyStateTitle = "No emails generated",
  emptyStateDescription = "No emails have been generated yet.",
  searchEmptyStateTitle = "No emails found",
  searchEmptyStateDescription = "No emails match your search criteria.",
}: EmailListViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Helper function to get donor data
  const getDonorData = useCallback(
    (donorId: number) => {
      return donors.find((donor) => donor.id === donorId);
    },
    [donors]
  );

  // Helper function to get tracking stats
  const getDonorTrackingStats = useCallback(
    (donorId: number) => {
      return trackingStats.find((stats) => stats.donorId === donorId);
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
      return emails;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const textExtractor = getSearchableText || defaultGetSearchableText;

    return emails.filter((email) => {
      const donor = getDonorData(email.donorId);
      if (!donor) return false;

      const searchableText = textExtractor(email, donor);
      return searchableText.includes(searchLower);
    });
  }, [emails, searchTerm, getDonorData, getSearchableText, defaultGetSearchableText]);

  // Pagination logic
  const totalPages = Math.ceil(filteredEmails.length / emailsPerPage);
  const startIndex = (currentPage - 1) * emailsPerPage;
  const endIndex = startIndex + emailsPerPage;
  const paginatedEmails = showPagination ? filteredEmails.slice(startIndex, endIndex) : filteredEmails;

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
      {/* Search Bar */}
      {showSearch && (
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                onClick={clearSearch}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {searchTerm && (
            <p className="text-sm text-muted-foreground mt-2">
              {filteredEmails.length} result{filteredEmails.length !== 1 ? "s" : ""} found for &quot;{searchTerm}&quot;
            </p>
          )}
        </div>
      )}

      {/* Pagination Info */}
      {showPagination && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredEmails.length)} of {filteredEmails.length} emails
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
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
              style={{ maxHeight: maxHeight }}
            >
              <div className="border-r bg-background flex flex-col h-full" style={{ maxHeight: maxHeight }}>
                <div className="p-3 border-b bg-muted/30 flex-shrink-0">
                  <h3 className="font-medium text-sm text-muted-foreground">
                    Recipients ({paginatedEmails.length}
                    {showPagination && filteredEmails.length !== paginatedEmails.length
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
                              <span className="font-medium text-sm truncate flex-1">{formatDonorName(donor)}</span>
                              {trackingStatsData && trackingStatsData.uniqueOpens > 0 && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1 ml-2">
                                  <Eye className="h-3 w-3" />
                                  {trackingStatsData.uniqueOpens}
                                </Badge>
                              )}
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
              </div>

              <div className="flex flex-col h-full" style={{ maxHeight: maxHeight }}>
                {paginatedEmails.map((email) => {
                  const donor = getDonorData(email.donorId);
                  if (!donor) return null;

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
