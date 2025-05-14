"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { CommunicateSteps } from "@/app/(app)/communicate/components/CommunicateSteps";
import { useState } from "react";

export function CommunicateButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquare className="w-4 h-4 mr-2" />
          Communicate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Communicate with Donors</DialogTitle>
        </DialogHeader>
        <CommunicateSteps onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
