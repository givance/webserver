"use client";

import { CampaignSteps } from "./components/CampaignSteps";
import { useRouter } from "next/navigation";

export default function CampaignPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaign</h1>
          <p className="text-muted-foreground">Create a new campaign to engage with your donors.</p>
        </div>
      </div>
      <CampaignSteps onClose={() => router.push("/existing-campaigns")} />
    </div>
  );
}
