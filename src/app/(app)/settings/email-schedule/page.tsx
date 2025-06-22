import { Clock } from "lucide-react";
import { EmailScheduleSettings } from "@/app/(app)/campaign/components/EmailScheduleSettings";

export default function EmailSchedulePage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex items-center space-x-2">
          <Clock className="h-8 w-8" />
          <h2 className="text-3xl font-bold tracking-tight">Email Schedule</h2>
        </div>
      </div>
      <EmailScheduleSettings />
    </div>
  );
}