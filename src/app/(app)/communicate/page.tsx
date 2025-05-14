"use client";

import { CommunicateSteps } from "@/components/communicate/steps/CommunicateSteps";
import { useRouter } from "next/navigation";

export default function CommunicatePage() {
  const router = useRouter();

  return (
    <>
      <title>Communicate with Donors</title>
      <div className="container mx-auto py-6">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <CommunicateSteps onClose={() => router.back()} />
          </div>
        </div>
      </div>
    </>
  );
}
