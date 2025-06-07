"use client";

import { CampaignSteps } from "@/app/(app)/campaign/components/CampaignSteps";
import { useRouter } from "next/navigation";

export default function CampaignPage() {
  const router = useRouter();

  return (
    <>
      <title>Campaign</title>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <div className="flex items-center px-6 h-14 border-b">
          <h1 className="text-2xl font-bold">Campaign</h1>
        </div>
        <div className="flex-1 overflow-auto">
          <CampaignSteps onClose={() => router.back()} />
        </div>
      </div>
    </>
  );
}
