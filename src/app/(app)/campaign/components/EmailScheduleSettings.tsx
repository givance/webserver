"use client";

import { useState, useEffect } from "react";
import { useCommunications } from "@/app/hooks/use-communications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Settings, Info, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function EmailScheduleSettings() {
  const { getScheduleConfig, updateScheduleConfig, listCampaigns } = useCommunications();
  const { data: config, isLoading } = getScheduleConfig();
  const { data: campaigns } = listCampaigns();
  
  // Filter for active campaigns (those with scheduled or running status)
  const activeCampaigns = campaigns?.filter(campaign => 
    campaign.status === 'running' || campaign.status === 'scheduled'
  ) || [];

  const [dailyLimit, setDailyLimit] = useState(150);
  const [minGap, setMinGap] = useState(1);
  const [maxGap, setMaxGap] = useState(3);
  const [timezone, setTimezone] = useState("America/New_York");
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [allowedStartTime, setAllowedStartTime] = useState("09:00");
  const [allowedEndTime, setAllowedEndTime] = useState("17:00");
  const [allowedTimezone, setAllowedTimezone] = useState("America/New_York");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  // Common timezones
  const timezones = [
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "America/Phoenix", label: "Arizona Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Europe/London", label: "London (GMT)" },
    { value: "Europe/Paris", label: "Paris (CET)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "Australia/Sydney", label: "Sydney (AEDT)" },
  ];

  // Days of the week
  const daysOfWeek = [
    { value: 0, label: "Sunday", short: "Sun" },
    { value: 1, label: "Monday", short: "Mon" },
    { value: 2, label: "Tuesday", short: "Tue" },
    { value: 3, label: "Wednesday", short: "Wed" },
    { value: 4, label: "Thursday", short: "Thu" },
    { value: 5, label: "Friday", short: "Fri" },
    { value: 6, label: "Saturday", short: "Sat" },
  ];

  // Load config values
  useEffect(() => {
    if (config) {
      setDailyLimit(config.dailyLimit);
      setMinGap(config.minGapMinutes);
      setMaxGap(config.maxGapMinutes);
      setTimezone(config.timezone);
      setAllowedDays(config.allowedDays || [1, 2, 3, 4, 5]);
      setAllowedStartTime(config.allowedStartTime || "09:00");
      setAllowedEndTime(config.allowedEndTime || "17:00");
      setAllowedTimezone(config.allowedTimezone || "America/New_York");
    }
  }, [config]);

  // Check for changes
  useEffect(() => {
    if (config) {
      const changed = 
        dailyLimit !== config.dailyLimit ||
        minGap !== config.minGapMinutes ||
        maxGap !== config.maxGapMinutes ||
        timezone !== config.timezone ||
        JSON.stringify(allowedDays) !== JSON.stringify(config.allowedDays || [1, 2, 3, 4, 5]) ||
        allowedStartTime !== (config.allowedStartTime || "09:00") ||
        allowedEndTime !== (config.allowedEndTime || "17:00") ||
        allowedTimezone !== (config.allowedTimezone || "America/New_York");
      setHasChanges(changed);
    }
  }, [config, dailyLimit, minGap, maxGap, timezone, allowedDays, allowedStartTime, allowedEndTime, allowedTimezone]);

  const handleSave = async (rescheduleExisting = false) => {
    // Validate
    if (minGap > maxGap) {
      toast.error("Minimum gap cannot be greater than maximum gap");
      return;
    }

    if (allowedDays.length === 0) {
      toast.error("At least one day must be selected");
      return;
    }

    const startMinutes = timeToMinutes(allowedStartTime);
    const endMinutes = timeToMinutes(allowedEndTime);
    if (startMinutes >= endMinutes) {
      toast.error("End time must be after start time");
      return;
    }

    const updateData = {
      dailyLimit,
      minGapMinutes: minGap,
      maxGapMinutes: maxGap,
      timezone,
      allowedDays,
      allowedStartTime,
      allowedEndTime,
      allowedTimezone,
    };

    // Check if allowed time settings have changed and there are active campaigns
    const allowedTimeChanged = config && (
      JSON.stringify(allowedDays) !== JSON.stringify(config.allowedDays || [1, 2, 3, 4, 5]) ||
      allowedStartTime !== (config.allowedStartTime || "09:00") ||
      allowedEndTime !== (config.allowedEndTime || "17:00") ||
      allowedTimezone !== (config.allowedTimezone || "America/New_York")
    );

    if (allowedTimeChanged && activeCampaigns.length > 0 && !rescheduleExisting) {
      setPendingUpdate(updateData);
      setShowConfirmDialog(true);
      return;
    }

    setIsSaving(true);
    try {
      await updateScheduleConfig.mutateAsync({
        ...updateData,
        rescheduleExisting,
      });
      toast.success("Schedule settings updated successfully");
      setHasChanges(false);
      setPendingUpdate(null);
      setShowConfirmDialog(false);
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error("Failed to update settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setDailyLimit(config.dailyLimit);
      setMinGap(config.minGapMinutes);
      setMaxGap(config.maxGapMinutes);
      setTimezone(config.timezone);
      setAllowedDays(config.allowedDays || [1, 2, 3, 4, 5]);
      setAllowedStartTime(config.allowedStartTime || "09:00");
      setAllowedEndTime(config.allowedEndTime || "17:00");
      setAllowedTimezone(config.allowedTimezone || "America/New_York");
    }
  };

  // Utility function to convert time to minutes
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Handle day selection
  const toggleDay = (day: number) => {
    if (allowedDays.includes(day)) {
      if (allowedDays.length > 1) { // Prevent removing all days
        setAllowedDays(allowedDays.filter(d => d !== day));
      }
    } else {
      setAllowedDays([...allowedDays, day].sort());
    }
  };

  // Calculate estimated sending time
  const calculateEstimatedTime = (emailCount: number) => {
    const avgGap = (minGap + maxGap) / 2;
    const totalMinutes = emailCount * avgGap;
    const daysNeeded = Math.ceil(emailCount / dailyLimit);
    
    if (daysNeeded > 1) {
      return `~${daysNeeded} days`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) {
        return `~${hours}h ${minutes}m`;
      }
      return `~${minutes} minutes`;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Email Schedule Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Email Schedule Settings
        </CardTitle>
        <CardDescription>
          Configure how emails are scheduled and sent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily Limit */}
        <div className="space-y-2">
          <Label htmlFor="daily-limit">Daily Email Limit</Label>
          <div className="flex items-center gap-4">
            <Slider
              id="daily-limit"
              min={1}
              max={500}
              step={10}
              value={[dailyLimit]}
              onValueChange={(value) => setDailyLimit(value[0])}
              className="flex-1"
            />
            <Input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20"
              min={1}
              max={500}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum number of emails to send per day (1-500)
          </p>
        </div>

        {/* Gap Settings */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email Sending Gap (minutes)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="min-gap" className="text-xs text-muted-foreground">Minimum</Label>
                <Input
                  id="min-gap"
                  type="number"
                  value={minGap}
                  onChange={(e) => setMinGap(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-gap" className="text-xs text-muted-foreground">Maximum</Label>
                <Input
                  id="max-gap"
                  type="number"
                  value={maxGap}
                  onChange={(e) => setMaxGap(Math.max(minGap, parseInt(e.target.value) || minGap))}
                  min={minGap}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Random delay between {minGap}-{maxGap} minutes will be used between emails
            </p>
          </div>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone for Daily Limits</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Daily limits reset at midnight in this timezone
          </p>
        </div>

        {/* Allowed Time Settings */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <Label className="text-sm font-medium">Allowed Sending Times</Label>
          </div>

          {/* Allowed Days */}
          <div className="space-y-2">
            <Label className="text-sm">Allowed Days</Label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={allowedDays.includes(day.value)}
                    onCheckedChange={() => toggleDay(day.value)}
                  />
                  <Label 
                    htmlFor={`day-${day.value}`} 
                    className="text-xs font-normal cursor-pointer"
                  >
                    {day.short}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Emails will only be sent on selected days
            </p>
          </div>

          {/* Allowed Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="start-time" className="text-xs">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={allowedStartTime}
                onChange={(e) => setAllowedStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-time" className="text-xs">End Time</Label>
              <Input
                id="end-time"
                type="time"
                value={allowedEndTime}
                onChange={(e) => setAllowedEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Allowed Timezone */}
          <div className="space-y-2">
            <Label htmlFor="allowed-timezone" className="text-xs">Timezone for Allowed Hours</Label>
            <Select value={allowedTimezone} onValueChange={setAllowedTimezone}>
              <SelectTrigger id="allowed-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Emails will only be sent between {allowedStartTime} - {allowedEndTime} ({allowedTimezone}) on selected days
          </p>
        </div>

        {/* Example Calculations */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            <p className="font-medium">Estimated Sending Times:</p>
            <p className="text-sm">• 50 emails: {calculateEstimatedTime(50)}</p>
            <p className="text-sm">• 150 emails: {calculateEstimatedTime(150)}</p>
            <p className="text-sm">• 500 emails: {calculateEstimatedTime(500)}</p>
          </AlertDescription>
        </Alert>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex-1"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* Confirmation Dialog */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update Existing Campaigns?</AlertDialogTitle>
          <AlertDialogDescription>
            You have {activeCampaigns.length} active email campaign(s) with scheduled emails. 
            Would you like to reschedule existing campaign emails to respect the new allowed time settings?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setShowConfirmDialog(false);
            setPendingUpdate(null);
          }}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={isSaving}
          >
            Save Without Rescheduling
          </Button>
          <AlertDialogAction
            onClick={() => handleSave(true)}
            disabled={isSaving}
          >
            {isSaving ? "Updating..." : "Save & Reschedule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}