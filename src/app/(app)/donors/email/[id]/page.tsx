"use client";

import { useRouter, useParams } from "next/navigation";
import { WriteInstructionStep } from "@/app/(app)/communicate/steps/WriteInstructionStep";
import { useState, useEffect } from "react";
import { useDonors } from "@/app/hooks/use-donors";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DonorEmailPage() {
  const router = useRouter();
  const params = useParams();
  const donorId = params.id as string;
  const [instruction, setInstruction] = useState("");

  const { getDonorQuery } = useDonors();
  const { data: donor, isLoading } = getDonorQuery(Number(donorId));

  // Get the email action from the donor's predicted actions
  const emailAction = donor?.predictedActions
    ? (typeof donor.predictedActions === "string" ? JSON.parse(donor.predictedActions) : donor.predictedActions).find(
        (action: any) => action.type === "email"
      )
    : null;

  // Set the instruction from the email action when it's loaded
  useEffect(() => {
    if (emailAction?.instruction) {
      setInstruction(emailAction.instruction);
    }
  }, [emailAction]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!donor) {
    return <div>Donor not found</div>;
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
      </div>

      <WriteInstructionStep
        instruction={instruction}
        onInstructionChange={setInstruction}
        onBack={() => router.push("/donors")}
        onNext={() => router.push("/donors")}
        selectedDonors={[Number(donorId)]}
      />
    </div>
  );
}
