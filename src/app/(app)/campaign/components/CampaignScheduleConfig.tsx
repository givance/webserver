'use client';

import { useState, useEffect } from 'react';
import { useCommunications } from '@/app/hooks/use-communications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CampaignScheduleConfigProps {
  scheduleConfig?: {
    dailyLimit?: number;
    minGapMinutes?: number;
    maxGapMinutes?: number;
    timezone?: string;
    allowedDays?: number[];
    allowedStartTime?: string;
    allowedEndTime?: string;
    allowedTimezone?: string;
    dailySchedules?: {
      [key: number]: {
        startTime: string;
        endTime: string;
        enabled: boolean;
      };
    };
  };
  onChange: (config: any) => void;
  compact?: boolean;
}

export function CampaignScheduleConfig({
  scheduleConfig,
  onChange,
  compact = false,
}: CampaignScheduleConfigProps) {
  const { getScheduleConfig } = useCommunications();
  const { data: defaultConfig } = getScheduleConfig();

  const [mounted, setMounted] = useState(false);
  const [useOrgDefaults, setUseOrgDefaults] = useState(!scheduleConfig);

  // Initialize state with campaign config or defaults
  const [dailyLimit, setDailyLimit] = useState(
    scheduleConfig?.dailyLimit || defaultConfig?.dailyLimit || 150
  );
  const [minGap, setMinGap] = useState(
    scheduleConfig?.minGapMinutes || defaultConfig?.minGapMinutes || 1
  );
  const [maxGap, setMaxGap] = useState(
    scheduleConfig?.maxGapMinutes || defaultConfig?.maxGapMinutes || 3
  );
  const [timezone, setTimezone] = useState(
    scheduleConfig?.timezone || defaultConfig?.timezone || 'America/New_York'
  );
  const [allowedDays, setAllowedDays] = useState<number[]>(
    scheduleConfig?.allowedDays || defaultConfig?.allowedDays || [1, 2, 3, 4, 5]
  );
  const [allowedStartTime, setAllowedStartTime] = useState(
    scheduleConfig?.allowedStartTime || defaultConfig?.allowedStartTime || '09:00'
  );
  const [allowedEndTime, setAllowedEndTime] = useState(
    scheduleConfig?.allowedEndTime || defaultConfig?.allowedEndTime || '17:00'
  );
  const [allowedTimezone, setAllowedTimezone] = useState(
    scheduleConfig?.allowedTimezone || defaultConfig?.allowedTimezone || 'America/New_York'
  );

  // Per-day schedule state
  const [useDailySchedules, setUseDailySchedules] = useState(!!scheduleConfig?.dailySchedules);
  const [dailySchedules, setDailySchedules] = useState<{
    [key: number]: {
      startTime: string;
      endTime: string;
      enabled: boolean;
    };
  }>(scheduleConfig?.dailySchedules || {});

  // Common timezones
  const timezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Phoenix', label: 'Arizona Time' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
    { value: 'America/Anchorage', label: 'Alaska Time' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  ];

  // Days of the week
  const daysOfWeek = [
    { value: 0, label: 'Sunday', short: 'Sun' },
    { value: 1, label: 'Monday', short: 'Mon' },
    { value: 2, label: 'Tuesday', short: 'Tue' },
    { value: 3, label: 'Wednesday', short: 'Wed' },
    { value: 4, label: 'Thursday', short: 'Thu' },
    { value: 5, label: 'Friday', short: 'Fri' },
    { value: 6, label: 'Saturday', short: 'Sat' },
  ];

  // Set mounted flag
  useEffect(() => {
    setMounted(true);
  }, []);

  // Call onChange when component state is updated (only after mount)
  useEffect(() => {
    if (!mounted) return;

    if (!useOrgDefaults) {
      onChange({
        dailyLimit,
        minGapMinutes: minGap,
        maxGapMinutes: maxGap,
        timezone,
        allowedDays,
        allowedStartTime,
        allowedEndTime,
        allowedTimezone,
        dailySchedules: useDailySchedules ? dailySchedules : undefined,
      });
    }
  }, [
    dailyLimit,
    minGap,
    maxGap,
    timezone,
    allowedDays,
    allowedStartTime,
    allowedEndTime,
    allowedTimezone,
    useOrgDefaults,
    mounted,
    useDailySchedules,
    dailySchedules,
  ]);

  // Handle toggle between org defaults and custom
  const handleUseOrgDefaultsChange = (checked: boolean) => {
    setUseOrgDefaults(checked);

    if (checked) {
      // Using org defaults
      onChange(null);
    } else {
      // When switching to custom, initialize with org defaults if available
      if (defaultConfig) {
        setDailyLimit(defaultConfig.dailyLimit);
        setMinGap(defaultConfig.minGapMinutes);
        setMaxGap(defaultConfig.maxGapMinutes);
        setTimezone(defaultConfig.timezone);
        setAllowedDays(defaultConfig.allowedDays || [1, 2, 3, 4, 5]);
        setAllowedStartTime(defaultConfig.allowedStartTime || '09:00');
        setAllowedEndTime(defaultConfig.allowedEndTime || '17:00');
        setAllowedTimezone(defaultConfig.allowedTimezone || 'America/New_York');

        // Send the config immediately
        onChange({
          dailyLimit: defaultConfig.dailyLimit,
          minGapMinutes: defaultConfig.minGapMinutes,
          maxGapMinutes: defaultConfig.maxGapMinutes,
          timezone: defaultConfig.timezone,
          allowedDays: defaultConfig.allowedDays || [1, 2, 3, 4, 5],
          allowedStartTime: defaultConfig.allowedStartTime || '09:00',
          allowedEndTime: defaultConfig.allowedEndTime || '17:00',
          allowedTimezone: defaultConfig.allowedTimezone || 'America/New_York',
        });
      }
    }
  };

  // Initialize daily schedules when toggling the feature
  const handleUseDailySchedulesChange = (checked: boolean) => {
    setUseDailySchedules(checked);

    if (checked) {
      // Initialize daily schedules for all allowed days
      const newSchedules: any = {};
      allowedDays.forEach((day) => {
        newSchedules[day] = dailySchedules[day] || {
          startTime: allowedStartTime,
          endTime: allowedEndTime,
          enabled: true,
        };
      });
      setDailySchedules(newSchedules);
    }
  };

  // Handle day selection
  const toggleDay = (day: number) => {
    if (allowedDays.includes(day)) {
      if (allowedDays.length > 1) {
        setAllowedDays(allowedDays.filter((d) => d !== day));
        // Remove daily schedule for this day
        const newSchedules = { ...dailySchedules };
        delete newSchedules[day];
        setDailySchedules(newSchedules);
      }
    } else {
      setAllowedDays([...allowedDays, day].sort());
      // Add default schedule for this day if using daily schedules
      if (useDailySchedules) {
        setDailySchedules({
          ...dailySchedules,
          [day]: {
            startTime: allowedStartTime,
            endTime: allowedEndTime,
            enabled: true,
          },
        });
      }
    }
  };

  // Update daily schedule for a specific day
  const updateDaySchedule = (day: number, field: 'startTime' | 'endTime', value: string) => {
    setDailySchedules({
      ...dailySchedules,
      [day]: {
        ...(dailySchedules[day] || {
          startTime: allowedStartTime,
          endTime: allowedEndTime,
          enabled: true,
        }),
        [field]: value,
      },
    });
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

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="use-defaults"
            checked={useOrgDefaults}
            onCheckedChange={(checked) => handleUseOrgDefaultsChange(checked as boolean)}
          />
          <Label htmlFor="use-defaults" className="text-sm font-normal cursor-pointer">
            Use organization default schedule settings
          </Label>
        </div>

        {!useOrgDefaults && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Custom Schedule Settings</CardTitle>
              <CardDescription className="text-sm">
                Configure custom schedule settings for this campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Daily Limit */}
              <div className="space-y-2">
                <Label className="text-sm">Daily Email Limit: {dailyLimit}</Label>
                <Slider
                  min={1}
                  max={500}
                  step={10}
                  value={[dailyLimit]}
                  onValueChange={(value) => setDailyLimit(value[0])}
                  disabled={useOrgDefaults}
                />
              </div>

              {/* Gap Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Min Gap (min)</Label>
                  <Input
                    type="number"
                    value={minGap}
                    onChange={(e) => setMinGap(Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    disabled={useOrgDefaults}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Gap (min)</Label>
                  <Input
                    type="number"
                    value={maxGap}
                    onChange={(e) =>
                      setMaxGap(Math.max(minGap, parseInt(e.target.value) || minGap))
                    }
                    min={minGap}
                    disabled={useOrgDefaults}
                  />
                </div>
              </div>

              {/* Allowed Days */}
              <div className="space-y-2">
                <Label className="text-sm">Allowed Days</Label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day) => (
                    <div key={day.value} className="flex items-center space-x-1">
                      <Checkbox
                        id={`campaign-day-${day.value}`}
                        checked={allowedDays.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                        disabled={useOrgDefaults}
                      />
                      <Label
                        htmlFor={`campaign-day-${day.value}`}
                        className="text-xs font-normal cursor-pointer"
                      >
                        {day.short}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-day schedules toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-daily-schedules"
                  checked={useDailySchedules}
                  onCheckedChange={(checked) => handleUseDailySchedulesChange(checked as boolean)}
                  disabled={useOrgDefaults}
                />
                <Label htmlFor="use-daily-schedules" className="text-sm font-normal cursor-pointer">
                  Use different times for each day
                </Label>
              </div>

              {/* Time Range - either default or per-day */}
              {!useDailySchedules ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Time</Label>
                    <Input
                      type="time"
                      value={allowedStartTime}
                      onChange={(e) => setAllowedStartTime(e.target.value)}
                      disabled={useOrgDefaults}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Time</Label>
                    <Input
                      type="time"
                      value={allowedEndTime}
                      onChange={(e) => setAllowedEndTime(e.target.value)}
                      disabled={useOrgDefaults}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm">Daily Schedules</Label>
                  <div className="space-y-2">
                    {allowedDays.sort().map((day) => {
                      const dayName = daysOfWeek.find((d) => d.value === day)?.label || '';
                      const schedule = dailySchedules[day] || {
                        startTime: allowedStartTime,
                        endTime: allowedEndTime,
                        enabled: true,
                      };
                      return (
                        <div key={day} className="grid grid-cols-3 gap-2 items-center">
                          <Label className="text-xs">{dayName}</Label>
                          <Input
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) => updateDaySchedule(day, 'startTime', e.target.value)}
                            disabled={useOrgDefaults}
                            className="text-xs"
                          />
                          <Input
                            type="time"
                            value={schedule.endTime}
                            onChange={(e) => updateDaySchedule(day, 'endTime', e.target.value)}
                            disabled={useOrgDefaults}
                            className="text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timezone */}
              <div className="space-y-2">
                <Label className="text-sm">Timezone</Label>
                <Select
                  value={allowedTimezone}
                  onValueChange={setAllowedTimezone}
                  disabled={useOrgDefaults}
                >
                  <SelectTrigger>
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
            </CardContent>
          </Card>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {useOrgDefaults ? (
              <span>Using organization default schedule settings</span>
            ) : (
              <span>
                Emails will be sent within the available time with {minGap}-{maxGap} minute gaps
              </span>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Full view (for dedicated page)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Campaign Schedule Configuration
        </CardTitle>
        <CardDescription>Configure schedule settings for this campaign</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Content similar to compact view but with more spacing and details */}
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-defaults-full"
              checked={useOrgDefaults}
              onCheckedChange={(checked) => handleUseOrgDefaultsChange(checked as boolean)}
            />
            <Label htmlFor="use-defaults-full" className="font-normal cursor-pointer">
              Use organization default schedule settings
            </Label>
          </div>

          {!useOrgDefaults && (
            <>
              {/* Similar content as compact view but with full layout */}
              {/* ... rest of the configuration fields ... */}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
