"use client";

import { useState, useEffect } from "react";
import { useCommunications } from "@/app/hooks/use-communications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function EmailScheduleSettings() {
  const { getScheduleConfig, updateScheduleConfig } = useCommunications();
  const { data: config, isLoading } = getScheduleConfig();

  const [dailyLimit, setDailyLimit] = useState(150);
  const [minGap, setMinGap] = useState(1);
  const [maxGap, setMaxGap] = useState(3);
  const [timezone, setTimezone] = useState("America/New_York");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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

  // Load config values
  useEffect(() => {
    if (config) {
      setDailyLimit(config.dailyLimit);
      setMinGap(config.minGapMinutes);
      setMaxGap(config.maxGapMinutes);
      setTimezone(config.timezone);
    }
  }, [config]);

  // Check for changes
  useEffect(() => {
    if (config) {
      const changed = 
        dailyLimit !== config.dailyLimit ||
        minGap !== config.minGapMinutes ||
        maxGap !== config.maxGapMinutes ||
        timezone !== config.timezone;
      setHasChanges(changed);
    }
  }, [config, dailyLimit, minGap, maxGap, timezone]);

  const handleSave = async () => {
    // Validate
    if (minGap > maxGap) {
      toast.error("Minimum gap cannot be greater than maximum gap");
      return;
    }

    setIsSaving(true);
    try {
      await updateScheduleConfig.mutateAsync({
        dailyLimit,
        minGapMinutes: minGap,
        maxGapMinutes: maxGap,
        timezone,
      });
      toast.success("Schedule settings updated successfully");
      setHasChanges(false);
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
  );
}