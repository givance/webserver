import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

import { emailGenerationSessionStatusEnum } from './enums';
import { organizations } from './organizations';
import { users } from './auth';
import { templates } from './templates';
import { donors } from './donors';
import { emailSendJobs } from './scheduling';

/**
 * Email generation sessions table to track bulk email generation
 */
export const emailGenerationSessions = pgTable('email_generation_sessions', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  templateId: integer('template_id').references(() => templates.id), // Optional reference to template used
  jobName: varchar('job_name', { length: 255 }).notNull(), // Name for the campaign
  chatHistory: jsonb('chat_history').notNull(), // Array of chat messages
  selectedDonorIds: jsonb('selected_donor_ids').notNull(), // Array of donor IDs
  previewDonorIds: jsonb('preview_donor_ids').notNull(), // Array of donor IDs used for preview
  status: emailGenerationSessionStatusEnum('status').notNull().default('DRAFT'), // 'DRAFT', 'GENERATING', 'READY_TO_SEND', 'RUNNING', 'PAUSED', 'COMPLETED'
  triggerJobId: text('trigger_job_id'), // ID of the trigger job
  totalDonors: integer('total_donors').notNull(),
  completedDonors: integer('completed_donors').default(0).notNull(),
  errorMessage: text('error_message'),
  // Campaign-specific schedule configuration
  scheduleConfig: jsonb('schedule_config').$type<{
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
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

/**
 * Generated emails table to store all generated emails
 */
export const generatedEmails = pgTable(
  'generated_emails',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .references(() => emailGenerationSessions.id, { onDelete: 'cascade' })
      .notNull(),
    donorId: integer('donor_id')
      .references(() => donors.id, { onDelete: 'cascade' })
      .notNull(),
    subject: text('subject').notNull(),
    structuredContent: jsonb('structured_content').notNull(), // Array of EmailPiece objects
    referenceContexts: jsonb('reference_contexts').notNull(), // Record of reference IDs to context
    // New fields for the updated format
    emailContent: text('email_content'), // Plain text email content
    reasoning: text('reasoning'), // AI's reasoning for the email generation
    response: text('response'), // User-facing summary of what was delivered
    status: text('status').notNull().default('PENDING_APPROVAL'), // 'PENDING_APPROVAL', 'APPROVED', 'SENT'
    isPreview: boolean('is_preview').default(false).notNull(), // Whether this was a preview email
    isSent: boolean('is_sent').default(false).notNull(), // Whether this email has been sent
    sentAt: timestamp('sent_at'), // When this email was sent (null if not sent)
    // Scheduling fields
    sendJobId: integer('send_job_id'), // References emailSendJobs.id when scheduled
    scheduledSendTime: timestamp('scheduled_send_time'), // When this email is scheduled to be sent
    sendStatus: text('send_status').default('pending'), // 'pending', 'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'paused'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Ensure only one email per donor per session
    sessionDonorUnique: unique('generated_emails_session_id_donor_id_unique').on(
      table.sessionId,
      table.donorId
    ),
  })
);

/**
 * Relations for email generation tables
 */
export const emailGenerationSessionsRelations = relations(
  emailGenerationSessions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [emailGenerationSessions.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [emailGenerationSessions.userId],
      references: [users.id],
    }),
    template: one(templates, {
      fields: [emailGenerationSessions.templateId],
      references: [templates.id],
    }),
    generatedEmails: many(generatedEmails),
    emailSendJobs: many(emailSendJobs),
  })
);

export const generatedEmailsRelations = relations(generatedEmails, ({ one, many }) => ({
  session: one(emailGenerationSessions, {
    fields: [generatedEmails.sessionId],
    references: [emailGenerationSessions.id],
  }),
  donor: one(donors, {
    fields: [generatedEmails.donorId],
    references: [donors.id],
  }),
  sendJobs: many(emailSendJobs), // Email can have multiple send jobs (if retried)
}));
