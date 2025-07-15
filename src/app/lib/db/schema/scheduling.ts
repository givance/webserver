import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { generatedEmails } from './campaigns';
import { emailGenerationSessions } from './campaigns';

/**
 * Email schedule configuration table for organization-level settings
 */
export const emailScheduleConfig = pgTable('email_schedule_config', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  dailyLimit: integer('daily_limit').notNull().default(150), // Default daily email limit
  maxDailyLimit: integer('max_daily_limit').notNull().default(500), // Maximum allowed daily limit
  minGapMinutes: integer('min_gap_minutes').notNull().default(1), // Minimum gap between emails in minutes
  maxGapMinutes: integer('max_gap_minutes').notNull().default(3), // Maximum gap between emails in minutes
  timezone: text('timezone').notNull().default('America/New_York'), // Organization timezone for daily limits
  // Allowed time settings - supports different times per day
  allowedDays: jsonb('allowed_days').$type<number[]>().notNull().default([1, 2, 3, 4, 5]), // 0=Sunday, 1=Monday, ..., 6=Saturday
  allowedStartTime: text('allowed_start_time').notNull().default('09:00'), // Default HH:MM format
  allowedEndTime: text('allowed_end_time').notNull().default('17:00'), // Default HH:MM format
  allowedTimezone: text('allowed_timezone').notNull().default('America/New_York'), // Timezone for allowed hours
  // Per-day schedule overrides (optional)
  dailySchedules: jsonb('daily_schedules').$type<{
    [key: number]: {
      startTime: string;
      endTime: string;
      enabled: boolean;
    };
  }>(), // Day-specific schedules (0-6)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Email send jobs table to track individual scheduled email sends
 */
export const emailSendJobs = pgTable('email_send_jobs', {
  id: serial('id').primaryKey(),
  emailId: integer('email_id')
    .references(() => generatedEmails.id, { onDelete: 'cascade' })
    .notNull(),
  sessionId: integer('session_id')
    .references(() => emailGenerationSessions.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  triggerJobId: text('trigger_job_id'), // Trigger.dev job ID
  scheduledTime: timestamp('scheduled_time').notNull(), // When the email should be sent
  actualSendTime: timestamp('actual_send_time'), // When the email was actually sent
  status: text('status').notNull().default('scheduled'), // 'scheduled', 'running', 'completed', 'failed', 'cancelled'
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'), // Error message if failed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Relations for email scheduling tables
 */
export const emailScheduleConfigRelations = relations(emailScheduleConfig, ({ one }) => ({
  organization: one(organizations, {
    fields: [emailScheduleConfig.organizationId],
    references: [organizations.id],
  }),
}));

export const emailSendJobsRelations = relations(emailSendJobs, ({ one }) => ({
  email: one(generatedEmails, {
    fields: [emailSendJobs.emailId],
    references: [generatedEmails.id],
  }),
  session: one(emailGenerationSessions, {
    fields: [emailSendJobs.sessionId],
    references: [emailGenerationSessions.id],
  }),
  organization: one(organizations, {
    fields: [emailSendJobs.organizationId],
    references: [organizations.id],
  }),
}));
