import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommunicationThreadWithDetails } from "@/app/lib/data/communications";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CommunicationDialogProps {
  thread: CommunicationThreadWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommunicationDialog({ thread, open, onOpenChange }: CommunicationDialogProps) {
  if (!thread) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Communication Thread</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Thread Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold">Channel</div>
              <div className="capitalize">{thread.channel}</div>
            </div>
            <div>
              <div className="font-semibold">Created</div>
              <div>{new Date(thread.createdAt).toLocaleDateString()}</div>
            </div>
          </div>

          {/* Staff Members */}
          <div>
            <div className="font-semibold mb-1">Staff</div>
            <div className="space-y-1">
              {thread.staff?.map(
                (staffMember) =>
                  staffMember.staff && (
                    <div key={staffMember.staffId}>
                      {staffMember.staff.firstName} {staffMember.staff.lastName}
                    </div>
                  )
              )}
            </div>
          </div>

          {/* Donors */}
          <div>
            <div className="font-semibold mb-1">Donors</div>
            <div className="space-y-1">
              {thread.donors?.map(
                (donor) =>
                  donor.donor && (
                    <div key={donor.donorId}>
                      {donor.donor.firstName} {donor.donor.lastName}
                    </div>
                  )
              )}
            </div>
          </div>

          {/* Messages */}
          <div>
            <div className="font-semibold mb-2">Messages</div>
            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-4">
                {thread.content?.map((message, index) => (
                  <div key={index} className="space-y-1">
                    <div className="text-sm text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</div>
                    <div className="text-sm">{message.content}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
