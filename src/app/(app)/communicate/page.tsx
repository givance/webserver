"use client";

import { CommunicateSteps } from "@/app/(app)/communicate/components/CommunicateSteps";
import { useRouter } from "next/navigation";

export default function CommunicatePage() {
  const router = useRouter();

  return (
    <>
      <title>Communicate with Donors</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Communicate with Donors</h1>
        </div>
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <CommunicateSteps onClose={() => router.back()} />
          </div>
        </div>
      </div>
    </>
  );
}
