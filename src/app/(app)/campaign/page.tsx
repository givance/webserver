"use client";

import { CampaignSteps } from "./components/CampaignSteps";
import { useRouter } from "next/navigation";

export default function CampaignPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto py-4">
      <div className="mb-4">
        <h1 className="text-lg font-semibold">New Campaign</h1>
      </div>
      <CampaignSteps onClose={() => router.push("/existing-campaigns")} />
    </div>
  );
}
