"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { WriteInstructionStep } from "@/app/(app)/communicate/steps/WriteInstructionStep";
import { useState, useEffect, useRef } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { useOrganization } from "@/app/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import type { PredictedAction as ColumnPredictedAction } from "../../columns";

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
    for (const actionString of donor.predictedActions) {
      try {
        const actionObject: ColumnPredictedAction = JSON.parse(actionString);
        if (actionObject.type === "email") {
          emailAction = actionObject;
          break;
        }
      } catch (e) {
        console.error(`Failed to parse predicted action string: ${actionString}`, e);
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
        <h1 className="text-2xl font-bold">
          Email {donor.firstName} {donor.lastName}
        </h1>
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

      <WriteInstructionStep
        ref={writeInstructionRef}
        instruction={instruction}
        onInstructionChange={setInstruction}
        onBack={() => router.push("/donors")}
        onNext={() => router.push("/donors")}
        selectedDonors={[Number(donorId)]}
      />
    </div>
  );
}
