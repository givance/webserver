"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { WriteInstructionStep } from "@/app/(app)/campaign/steps/WriteInstructionStep";
import { useState, useEffect, useRef } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import type { PredictedAction as ColumnPredictedAction } from "../../columns";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";

export default function DonorEmailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const donorId = params.id as string;
  const [instruction, setInstruction] = useState("");
  const [autoDraft, setAutoDraft] = useState(searchParams.get("autoDraft") === "true");
  const writeInstructionRef = useRef<{ click: () => Promise<void> }>(null);

  const { getDonorQuery } = useDonors();
  const { getOrganization } = useOrganization();
  const { data: donor, isLoading: isDonorLoading } = getDonorQuery(Number(donorId));
  const { data: organization, isLoading: isOrgLoading } = getOrganization();

  // Get the email action from the donor's predicted actions
  let emailAction: ColumnPredictedAction | null = null;
  if (donor?.predictedActions && Array.isArray(donor.predictedActions)) {
    // Iterate over each action, which might be a string or an object
    for (const actionItem of donor.predictedActions) {
      try {
        let actionObject: ColumnPredictedAction;

        if (typeof actionItem === "string") {
          // If it's a string, parse it as JSON
          actionObject = JSON.parse(actionItem) as ColumnPredictedAction;
        } else if (typeof actionItem === "object" && actionItem !== null) {
          // If it's already an object, assume it's the correct type.
          // Potentially add validation here if the object structure is not guaranteed.
          actionObject = actionItem as ColumnPredictedAction;
        } else {
          // Log and skip if the item is neither a string nor a valid object
          console.warn(`Skipping unexpected item in predictedActions: ${String(actionItem)}`);
          continue;
        }

        // Check if the parsed/retrieved action is of type "email"
        if (actionObject.type === "email") {
          emailAction = actionObject;

          break; // Found the email action, no need to continue
        }
      } catch (e) {
        // Log an error if parsing (for strings) or processing fails
        console.error(`Failed to process predicted action. Item: ${String(actionItem)}`, e);
        // Potentially log to a more persistent store if this is critical
      }
    }
  }

  // Set the instruction from the email action when it's loaded and trigger auto-draft if enabled
  useEffect(() => {
    if (emailAction?.instruction && organization) {
      setInstruction(emailAction.instruction);
      if (autoDraft) {
        // We need to wait for the instruction to be set in state before submitting
        const timer = setTimeout(() => {
          writeInstructionRef.current?.click();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [emailAction, autoDraft, organization]);

  if (isDonorLoading || isOrgLoading) {
    return <div>Loading...</div>;
  }

  if (!donor || !organization) {
    return <div>Data not found</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Link href="/donors" className="mr-4">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Email {formatDonorName(donor)}</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Auto Draft</label>
          <Switch
            checked={autoDraft}
            onCheckedChange={(checked) => {
              setAutoDraft(checked);
              // Update the URL to reflect the new state
              const newUrl = checked ? `/donors/email/${donorId}?autoDraft=true` : `/donors/email/${donorId}`;
              router.replace(newUrl);
            }}
            aria-label="Toggle auto draft"
          />
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <WriteInstructionStep
          ref={writeInstructionRef}
          instruction={instruction}
          onInstructionChange={setInstruction}
          onBack={() => router.push(`/donors/${donorId}`)}
          onNext={() => router.push("/existing-campaigns")}
          selectedDonors={[Number(donorId)]}
          campaignName={`Email to ${formatDonorName(donor)}`}
          onBulkGenerationComplete={() => router.push("/existing-campaigns")}
        />
      </div>
    </div>
  );
}
