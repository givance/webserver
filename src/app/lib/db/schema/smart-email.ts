import { relations, sql } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, varchar, integer, jsonb } from 'drizzle-orm/pg-core';

import { smartEmailSessionStatusEnum, smartEmailSessionStepEnum } from './enums';
import { organizations } from './organizations';
import { users } from './auth';

/**
 * Smart email generation sessions table for conversational email generation
 */
export const smartEmailSessions = pgTable('smart_email_sessions', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  status: smartEmailSessionStatusEnum('status').notNull().default('active'),

  // Core session data
  donorIds: jsonb('donor_ids').notNull(), // Array of donor IDs
  initialInstruction: text('initial_instruction').notNull(),
  finalInstruction: text('final_instruction'),

  // Conversation state
  currentStep: smartEmailSessionStepEnum('current_step').notNull().default('analyzing'),

  // Intermediate results (cached for performance)
  donorAnalysis: jsonb('donor_analysis'),
  orgAnalysis: jsonb('org_analysis'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at')
    .notNull()
    .default(sql`now() + interval '24 hours'`),
});

/**
 * Smart email generation messages table for conversation history
 */
export const smartEmailMessages = pgTable('smart_email_messages', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => smartEmailSessions.id, { onDelete: 'cascade' })
    .notNull(),
  messageIndex: integer('message_index').notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls'), // Store tool calls made by AI
  toolResults: jsonb('tool_results'), // Store tool call results
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Relations for smart email sessions
 */
export const smartEmailSessionsRelations = relations(smartEmailSessions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [smartEmailSessions.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [smartEmailSessions.userId],
    references: [users.id],
  }),
  messages: many(smartEmailMessages),
}));

/**
 * Relations for smart email messages
 */
export const smartEmailMessagesRelations = relations(smartEmailMessages, ({ one }) => ({
  session: one(smartEmailSessions, {
    fields: [smartEmailMessages.sessionId],
    references: [smartEmailSessions.id],
  }),
}));
