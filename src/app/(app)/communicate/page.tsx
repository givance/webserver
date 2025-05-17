"use client";

import { CommunicateSteps } from "@/app/(app)/communicate/components/CommunicateSteps";
import { useRouter } from "next/navigation";

export default function CommunicatePage() {
  const router = useRouter();

  return (
    <>
      <title>Communicate with Donors</title>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <div className="flex items-center px-6 h-14 border-b">
          <h1 className="text-2xl font-bold">Communicate with Donors</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <CommunicateSteps onClose={() => router.back()} />
        </div>
      </div>
    </>
  );
}
