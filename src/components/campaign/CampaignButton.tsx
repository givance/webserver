"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { CampaignSteps } from "@/app/(app)/campaign/components/CampaignSteps";

export function CampaignButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Campaign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Campaign</DialogTitle>
        </DialogHeader>
        <CampaignSteps onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
