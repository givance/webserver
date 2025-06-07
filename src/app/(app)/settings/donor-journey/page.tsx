"use client";

import { GitGraph } from "lucide-react";
import { DonorJourneySettings } from "./DonorJourneySettings";

export default function DonorJourneyPage() {
  return (
    <>
      <title>Donor Journey - Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <GitGraph className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Donor Journey</h1>
        </div>

        <DonorJourneySettings />
      </div>
    </>
  );
}
