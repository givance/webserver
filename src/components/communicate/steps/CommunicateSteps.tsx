import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { CommunicateFlow } from "../CommunicateFlow";

interface CommunicateStepsProps {
  onClose: () => void;
}

export function CommunicateSteps({ onClose }: CommunicateStepsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Communicate with Donors</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <CommunicateFlow onClose={onClose} />
    </div>
  );
}
