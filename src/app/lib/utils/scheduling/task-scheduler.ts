import { task, runs } from '@trigger.dev/sdk/v3';

export interface ScheduleConfig {
  dailyLimit?: number;
  minGapMinutes?: number;
  maxGapMinutes?: number;
  timezone?: string;
  allowedDays?: number[];
  allowedStartTime?: string;
  allowedEndTime?: string;
  allowedTimezone?: string;
  dailySchedules?: {
    [dayOfWeek: number]: {
      startTime: string;
      endTime: string;
      enabled: boolean;
    };
  };
}

export interface SchedulableTask<T = any> {
  id: string;
  data: T;
  priority?: number;
}

export interface ScheduledTask<T = any> extends SchedulableTask<T> {
  scheduledTime: Date;
  dayIndex: number;
}

export interface ScheduleResult<T = any> {
  scheduledTasks: ScheduledTask<T>[];
  unscheduledTasks: SchedulableTask<T>[];
  totalDays: number;
  tasksPerDay: Map<number, number>;
}

export interface TriggerTaskConfig<T = any> {
  taskHandler: ReturnType<typeof task>;
  payloadBuilder: (task: ScheduledTask<T>, context: any) => any;
  context?: any;
}

export interface ScheduledJobResult {
  taskId: string;
  triggerId: string;
  scheduledTime: Date;
}

export function calculateSchedule<T = any>(
  tasks: SchedulableTask<T>[],
  config: ScheduleConfig,
  options: {
    startTime?: Date;
    maxDays?: number;
  } = {}
): ScheduleResult<T> {
  const {
    dailyLimit = 100,
    minGapMinutes = 5,
    maxGapMinutes = 15,
    timezone = 'America/New_York',
    allowedDays = [1, 2, 3, 4, 5],
    allowedStartTime = '09:00',
    allowedEndTime = '17:00',
    allowedTimezone = timezone,
    dailySchedules,
  } = config;

  const { startTime = new Date(), maxDays = 365 } = options;

  const scheduledTasks: ScheduledTask<T>[] = [];
  const unscheduledTasks: SchedulableTask<T>[] = [];
  const tasksPerDay = new Map<number, number>();

  const sortedTasks = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let currentTime = new Date(startTime);
  let dayIndex = 0;
  let dailyCount = 0;

  // Find the first allowed time slot
  if (!isTimeAllowed(currentTime, config)) {
    const firstAllowedTime = findNextAllowedTime(currentTime, config);
    if (!firstAllowedTime) {
      return {
        scheduledTasks: [],
        unscheduledTasks: tasks,
        totalDays: 0,
        tasksPerDay,
      };
    }
    currentTime = firstAllowedTime;
  }

  for (const task of sortedTasks) {
    let scheduled = false;
    let attempts = 0;
    const maxAttempts = maxDays * 24;

    while (!scheduled && attempts < maxAttempts) {
      attempts++;

      if (dailyCount >= dailyLimit || !isTimeAllowed(currentTime, config)) {
        const nextTime = findNextAllowedDay(currentTime, config);
        if (!nextTime || dayIndex >= maxDays) {
          break;
        }
        currentTime = nextTime;
        dayIndex++;
        dailyCount = 0;
      }

      if (isTimeAllowed(currentTime, config)) {
        scheduledTasks.push({
          ...task,
          scheduledTime: new Date(currentTime),
          dayIndex,
        });

        dailyCount++;
        tasksPerDay.set(dayIndex, (tasksPerDay.get(dayIndex) || 0) + 1);

        const gap = Math.floor(Math.random() * (maxGapMinutes - minGapMinutes + 1)) + minGapMinutes;
        currentTime = new Date(currentTime.getTime() + gap * 60 * 1000);

        scheduled = true;
      } else {
        const nextTime = findNextAllowedTime(currentTime, config);
        if (!nextTime) {
          break;
        }
        currentTime = nextTime;
      }
    }

    if (!scheduled) {
      unscheduledTasks.push(task);
    }
  }

  return {
    scheduledTasks,
    unscheduledTasks,
    totalDays: dayIndex + 1,
    tasksPerDay,
  };
}

export async function scheduleTasks<T = any>(
  scheduledTasks: ScheduledTask<T>[],
  triggerConfig: TriggerTaskConfig<T>
): Promise<ScheduledJobResult[]> {
  const { taskHandler, payloadBuilder, context } = triggerConfig;
  const results: ScheduledJobResult[] = [];

  for (const task of scheduledTasks) {
    const payload = payloadBuilder(task, context);
    const triggerResult = await taskHandler.trigger(payload, {
      delay: task.scheduledTime,
    });

    results.push({
      taskId: task.id,
      triggerId: triggerResult.id,
      scheduledTime: task.scheduledTime,
    });
  }

  return results;
}

export async function cancelScheduledTasks(
  triggerIds: string[]
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const triggerId of triggerIds) {
    try {
      await runs.cancel(triggerId);
      succeeded.push(triggerId);
    } catch (error) {
      console.error(`Failed to cancel task ${triggerId}:`, error);
      failed.push(triggerId);
    }
  }

  return { succeeded, failed };
}

export async function scheduleAndTriggerTasks<T = any>(
  tasks: SchedulableTask<T>[],
  config: ScheduleConfig,
  triggerConfig: TriggerTaskConfig<T>,
  options: {
    startTime?: Date;
    maxDays?: number;
  } = {}
): Promise<{
  scheduleResult: ScheduleResult<T>;
  scheduledJobs: ScheduledJobResult[];
}> {
  const scheduleResult = calculateSchedule(tasks, config, options);
  const scheduledJobs = await scheduleTasks(scheduleResult.scheduledTasks, triggerConfig);

  return {
    scheduleResult,
    scheduledJobs,
  };
}

function isTimeAllowed(time: Date, config: ScheduleConfig): boolean {
  const {
    allowedDays = [1, 2, 3, 4, 5],
    allowedStartTime = '09:00',
    allowedEndTime = '17:00',
    allowedTimezone = 'America/New_York',
    dailySchedules,
  } = config;

  if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
    return false;
  }

  const timeInZone = getDateInTimezone(time, allowedTimezone);
  const dayOfWeek = timeInZone.dayOfWeek;

  if (dailySchedules && dailySchedules[dayOfWeek]) {
    const daySchedule = dailySchedules[dayOfWeek];
    if (!daySchedule.enabled) {
      return false;
    }
    const startTime = daySchedule.startTime || allowedStartTime;
    const endTime = daySchedule.endTime || allowedEndTime;
    return isWithinTimeRange(timeInZone, startTime, endTime);
  }

  if (!allowedDays.includes(dayOfWeek)) {
    return false;
  }

  return isWithinTimeRange(timeInZone, allowedStartTime, allowedEndTime);
}

function isWithinTimeRange(
  timeComponents: ReturnType<typeof getDateInTimezone>,
  startTime: string,
  endTime: string
): boolean {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  const currentMinutes = timeComponents.hour * 60 + timeComponents.minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function findNextAllowedTime(time: Date, config: ScheduleConfig): Date | null {
  const { allowedStartTime = '09:00', allowedTimezone = 'America/New_York' } = config;

  if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
    return null;
  }

  let current = new Date(time);
  let attempts = 0;
  const maxAttempts = 365;

  while (attempts < maxAttempts) {
    attempts++;

    if (isTimeAllowed(current, config)) {
      return current;
    }

    // Move to next day and find the correct start time for that day
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);

    const timeInZone = getDateInTimezone(current, allowedTimezone);
    const dayOfWeek = timeInZone.dayOfWeek;

    // Check if this day has a daily schedule override
    if (
      config.dailySchedules &&
      config.dailySchedules[dayOfWeek] &&
      config.dailySchedules[dayOfWeek].enabled
    ) {
      const daySchedule = config.dailySchedules[dayOfWeek];
      const [scheduleStartHour, scheduleStartMinute] = daySchedule.startTime.split(':').map(Number);

      const targetDate = createDateInTimezone(
        timeInZone.year,
        timeInZone.month,
        timeInZone.day,
        scheduleStartHour,
        scheduleStartMinute,
        0,
        allowedTimezone
      );
      current = targetDate;
    } else {
      // Use default start time
      const [startHour, startMinute] = allowedStartTime.split(':').map(Number);
      const targetDate = createDateInTimezone(
        timeInZone.year,
        timeInZone.month,
        timeInZone.day,
        startHour,
        startMinute,
        0,
        allowedTimezone
      );
      current = targetDate;
    }
  }

  return null;
}

function findNextAllowedDay(time: Date, config: ScheduleConfig): Date | null {
  const { allowedStartTime = '09:00', allowedTimezone = 'America/New_York' } = config;

  if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
    return null;
  }

  let current = new Date(time);

  // Move to next day
  current = new Date(current.getTime() + 24 * 60 * 60 * 1000);

  const timeInZone = getDateInTimezone(current, allowedTimezone);
  const dayOfWeek = timeInZone.dayOfWeek;

  // Check if this day has a daily schedule override
  let startHour: number, startMinute: number;
  if (
    config.dailySchedules &&
    config.dailySchedules[dayOfWeek] &&
    config.dailySchedules[dayOfWeek].enabled
  ) {
    const daySchedule = config.dailySchedules[dayOfWeek];
    [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
  } else {
    [startHour, startMinute] = allowedStartTime.split(':').map(Number);
  }

  // Set the time properly in the target timezone
  const targetDate = createDateInTimezone(
    timeInZone.year,
    timeInZone.month,
    timeInZone.day,
    startHour,
    startMinute,
    0,
    allowedTimezone
  );

  return findNextAllowedTime(targetDate, config);
}

function getDateInTimezone(
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
} {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(`Invalid date provided to getDateInTimezone: ${date}`);
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const dateStr = date.toLocaleString('en-US', options);
  const [datePart, timePart] = dateStr.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);

  const dayOfWeek = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getDay();

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek,
  };
}

function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  // Create a localized date string
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(
    hour
  ).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  // Start with an approximation
  let utcDate = new Date(dateStr + 'Z'); // Assume it's UTC

  // Adjust based on the difference
  for (let i = 0; i < 5; i++) {
    const currentTz = getDateInTimezone(utcDate, timezone);

    // Calculate the difference in minutes
    const currentMinutes = (currentTz.day - day) * 24 * 60 + currentTz.hour * 60 + currentTz.minute;
    const targetMinutes = hour * 60 + minute;
    const diffMinutes = targetMinutes - currentMinutes;

    if (Math.abs(diffMinutes) < 1) break; // Close enough

    // Adjust the UTC time
    utcDate = new Date(utcDate.getTime() + diffMinutes * 60 * 1000);
  }

  return utcDate;
}
