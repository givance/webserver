"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import React from "react";
import { EmailDisplay } from "./EmailDisplay"; // Assuming EmailDisplay is in the same directory or adjust path
// import type { UseQueryResult } from "@tanstack/react-query"; // For donorQueries type
// Import 'donors' schema type or a more specific Donor type if available
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";

// Define types based on WriteInstructionStep.tsx
interface GeneratedEmailData {
  donorId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
}

// This is a simplified version; you might need a more specific type from your useDonors hook
// We can infer a part of the DonorData type from the schema, or use a more specific one if defined elsewhere
export interface DonorData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  // Add other relevant donor fields if needed from the 'donors' schema or your hook
}

// interface DonorQuery extends UseQueryResult<DonorData | undefined> {}

interface GeneratedEmailsDisplayProps {
  isGenerating: boolean;
  generatedEmails: GeneratedEmailData[];
  donors: DonorData[]; // Expecting an array of DonorData
  referenceContexts: Record<number, Record<string, string>>;
}

export const GeneratedEmailsDisplay: React.FC<GeneratedEmailsDisplayProps> = ({
  isGenerating,
  generatedEmails,
  donors,
  referenceContexts,
}) => {
  if (isGenerating) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p>Generating emails...</p>
        </div>
      </div>
    );
  }

  if (generatedEmails.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground h-full p-6">
        No emails generated yet. Emails will appear here once you provide instructions and click &quot;Generate
        Emails&quot;.
      </div>
    );
  }

  return (
    <Tabs defaultValue={generatedEmails[0]?.donorId?.toString()} orientation="vertical" className="flex-1">
      <div className="grid grid-cols-[200px_1fr] h-full">
        <div className="bg-muted/30 overflow-y-auto pr-1">
          <TabsList className="flex flex-col w-full space-y-1 h-auto p-1 mt-1">
            {generatedEmails.map((email) => {
              const donor = donors.find((d) => d.id === email.donorId);
              if (!donor) return null;

              return (
                <TabsTrigger
                  key={email.donorId}
                  value={email.donorId.toString()}
                  className={cn(
                    "w-full h-auto p-3 rounded-md",
                    "flex flex-col items-start justify-center gap-0.5",
                    "text-left",
                    "transition-all duration-200 hover:bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  )}
                >
                  <span className="font-medium truncate w-full text-sm">{formatDonorName(donor)}</span>
                  <span className="text-xs text-muted-foreground data-[state=active]:text-primary-foreground/80 truncate w-full">
                    {donor.email}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="flex flex-col h-full overflow-y-auto pl-1">
          {generatedEmails.map((email) => {
            const donor = donors.find((d) => d.id === email.donorId);
            if (!donor) return null;

            return (
              <TabsContent key={email.donorId} value={email.donorId.toString()} className="h-full p-0">
                <EmailDisplay
                  donorName={formatDonorName(donor)}
                  donorEmail={donor.email}
                  subject={email.subject}
                  content={email.structuredContent}
                  referenceContexts={referenceContexts[email.donorId] || {}}
                />
              </TabsContent>
            );
          })}
        </div>
      </div>
    </Tabs>
  );
};
