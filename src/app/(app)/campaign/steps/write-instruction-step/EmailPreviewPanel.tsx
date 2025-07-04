"use client";

import React from "react";
import { Mail } from "lucide-react";
import { EmailListViewer } from "../../components/EmailListViewer";
import { GeneratedEmail } from "./types";
import { EMAILS_PER_PAGE, GENERATE_MORE_COUNT } from "./constants";

interface EmailPreviewPanelProps {
  isGenerating: boolean;
  allGeneratedEmails: GeneratedEmail[];
  templatePrompt?: string;
  emailListViewerEmails: any[];
  emailListViewerDonors: any[];
  referenceContexts: Record<number, Record<string, string>>;
  handleEmailStatusChange: (emailId: number, status: "PENDING_APPROVAL" | "APPROVED") => void;
  isUpdatingStatus: boolean;
  sessionId?: number;
  handlePreviewEdit: (donorId: number, newSubject: string, newContent: any) => void;
  handlePreviewEnhance: (donorId: number, enhanceInstruction: string) => void;
  isGeneratingMore: boolean;
  totalRemainingDonors: number;
  isEmailListExpanded: boolean;
  setIsEmailListExpanded: (expanded: boolean) => void;
  staffData?: { staff: any[] };
  primaryStaff: any;
}

export function EmailPreviewPanel({
  isGenerating,
  allGeneratedEmails,
  templatePrompt,
  emailListViewerEmails,
  emailListViewerDonors,
  referenceContexts,
  handleEmailStatusChange,
  isUpdatingStatus,
  sessionId,
  handlePreviewEdit,
  handlePreviewEnhance,
  isGeneratingMore,
  totalRemainingDonors,
  isEmailListExpanded,
  setIsEmailListExpanded,
  staffData,
  primaryStaff,
}: EmailPreviewPanelProps) {
  return (
    <>
      {isGenerating && (
        <div className="flex items-center justify-center h-full text-muted-foreground p-3">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <div className="text-center">
              <p className="text-xs font-medium">Generating personalized emails...</p>
              <p className="text-xs text-muted-foreground">This may take a few moments</p>
            </div>
          </div>
        </div>
      )}
      {!isGenerating && allGeneratedEmails.length > 0 && (
        <div className="h-full overflow-hidden p-3 text-xs [&_button]:text-xs [&_button]:px-2 [&_button]:py-1 [&_button]:h-auto [&_p]:text-xs [&_span]:text-xs [&_div]:text-xs">
          <EmailListViewer
            emails={emailListViewerEmails}
            donors={emailListViewerDonors}
            referenceContexts={referenceContexts}
            showSearch={true}
            showPagination={true}
            showTracking={false}
            showStaffAssignment={true}
            showSendButton={false}
            showEditButton={true}
            showDonorTooltips={true}
            emailsPerPage={EMAILS_PER_PAGE}
            maxHeight="100%"
            emptyStateTitle="No emails generated yet"
            emptyStateDescription={
              templatePrompt
                ? "Generating emails from template..."
                : "Use the chat interface to generate emails"
            }
            onEmailStatusChange={handleEmailStatusChange}
            isUpdatingStatus={isUpdatingStatus}
            sessionId={sessionId}
            onPreviewEdit={handlePreviewEdit}
            onPreviewEnhance={handlePreviewEnhance}
            isGeneratingMore={isGeneratingMore}
            remainingDonorsCount={totalRemainingDonors}
            generateMoreCount={GENERATE_MORE_COUNT}
            isRecipientsExpanded={isEmailListExpanded}
            onRecipientsExpandedChange={setIsEmailListExpanded}
            getStaffName={(staffId) => {
              if (!staffId || !staffData?.staff) return "Unassigned";
              const staff = staffData.staff.find((s) => s.id === staffId);
              return staff ? `${staff.firstName} ${staff.lastName}` : "Unknown Staff";
            }}
            getStaffDetails={(staffId) => {
              if (!staffId || !staffData?.staff) return null;
              return staffData.staff.find((s) => s.id === staffId) || null;
            }}
            primaryStaff={primaryStaff || null}
          />
        </div>
      )}
      {!isGenerating && allGeneratedEmails.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground p-3">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium">No emails generated yet</p>
              <p className="text-xs text-muted-foreground">
                {templatePrompt
                  ? "Generating emails from template..."
                  : "Use the chat interface on the left to generate emails"}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}