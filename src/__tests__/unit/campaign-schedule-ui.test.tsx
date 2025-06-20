import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Test the schedule information display logic
describe("Campaign Schedule UI", () => {
  // Test the schedule information calculation
  const getScheduleInfo = (unsentCount: number, scheduleConfig: any) => {
    const dailyLimit = scheduleConfig?.dailyLimit || 150;
    const minGap = scheduleConfig?.minGapMinutes || 1;
    const maxGap = scheduleConfig?.maxGapMinutes || 3;
    const estimatedDays = Math.ceil(unsentCount / dailyLimit);

    return {
      emailsToSchedule: unsentCount,
      dailyLimit,
      timeBetweenEmails: `${minGap}-${maxGap} minutes`,
      estimatedDuration: `${estimatedDays} days`,
    };
  };

  it("should calculate schedule info correctly with default config", () => {
    const info = getScheduleInfo(300, null);
    
    expect(info.emailsToSchedule).toBe(300);
    expect(info.dailyLimit).toBe(150);
    expect(info.timeBetweenEmails).toBe("1-3 minutes");
    expect(info.estimatedDuration).toBe("2 days");
  });

  it("should calculate schedule info correctly with custom config", () => {
    const scheduleConfig = {
      dailyLimit: 100,
      minGapMinutes: 2,
      maxGapMinutes: 5,
    };
    
    const info = getScheduleInfo(450, scheduleConfig);
    
    expect(info.emailsToSchedule).toBe(450);
    expect(info.dailyLimit).toBe(100);
    expect(info.timeBetweenEmails).toBe("2-5 minutes");
    expect(info.estimatedDuration).toBe("5 days");
  });

  it("should handle single day duration", () => {
    const scheduleConfig = {
      dailyLimit: 500,
      minGapMinutes: 1,
      maxGapMinutes: 2,
    };
    
    const info = getScheduleInfo(100, scheduleConfig);
    
    expect(info.estimatedDuration).toBe("1 days");
  });

  it("should handle edge case of 0 emails", () => {
    const info = getScheduleInfo(0, null);
    
    expect(info.emailsToSchedule).toBe(0);
    expect(info.estimatedDuration).toBe("0 days");
  });

  // Test button visibility logic
  const shouldShowScheduleButton = (schedule: any) => {
    return !!(schedule?.totalScheduled && schedule.totalScheduled > 0);
  };

  it("should show schedule button when emails are scheduled", () => {
    const schedule = { totalScheduled: 10 };
    expect(shouldShowScheduleButton(schedule)).toBe(true);
  });

  it("should not show schedule button when no emails are scheduled", () => {
    const schedule = { totalScheduled: 0 };
    expect(shouldShowScheduleButton(schedule)).toBe(false);
  });

  it("should not show schedule button when schedule is null", () => {
    expect(shouldShowScheduleButton(null)).toBe(false);
  });
});