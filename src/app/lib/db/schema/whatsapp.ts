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

import { whatsappMessageRoleEnum, staffWhatsappActivityTypeEnum } from './enums';
import { organizations } from './organizations';
import { staff } from './staff';

/**
 * WhatsApp chat history table - stores conversations between staff and AI bot
 */
export const whatsappChatHistory = pgTable('whatsapp_chat_history_new', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'cascade' }), // Reference to the staff member (nullable for migration compatibility)
  fromPhoneNumber: varchar('from_phone_number', { length: 20 }).notNull(), // Staff WhatsApp number
  messageId: varchar('message_id', { length: 255 }), // WhatsApp message ID if available
  role: whatsappMessageRoleEnum('role').notNull(), // "user" for staff message, "assistant" for AI response
  content: text('content').notNull(), // The message content
  toolCalls: jsonb('tool_calls'), // Store AI tool calls (search queries, etc.) for context
  toolResults: jsonb('tool_results'), // Store tool results for reference
  tokensUsed: jsonb('tokens_used'), // Store token usage info
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Staff WhatsApp phone numbers table - manages allowed phone numbers per staff
 */
export const staffWhatsappPhoneNumbers = pgTable(
  'staff_whatsapp_phone_numbers',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .references(() => staff.id, { onDelete: 'cascade' })
      .notNull(),
    phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
    isAllowed: boolean('is_allowed').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Each phone number can only be assigned to one staff member
    uniquePhoneNumber: unique('staff_whatsapp_phone_numbers_phone_unique').on(table.phoneNumber),
  })
);

/**
 * Staff WhatsApp activity log table - comprehensive logging for all WhatsApp activities
 */
export const staffWhatsappActivityLog = pgTable('staff_whatsapp_activity_log', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id')
    .references(() => staff.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  activityType: staffWhatsappActivityTypeEnum('activity_type').notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  summary: text('summary').notNull(), // Brief description of the activity
  data: jsonb('data'), // Detailed data about the activity (query, response, error, etc.)
  metadata: jsonb('metadata'), // Additional context (tokens used, processing time, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Relations for WhatsApp chat history
 */
export const whatsappChatHistoryRelations = relations(whatsappChatHistory, ({ one }) => ({
  organization: one(organizations, {
    fields: [whatsappChatHistory.organizationId],
    references: [organizations.id],
  }),
  staff: one(staff, {
    fields: [whatsappChatHistory.staffId],
    references: [staff.id],
  }),
}));

/**
 * Relations for staff WhatsApp phone numbers
 */
export const staffWhatsappPhoneNumbersRelations = relations(
  staffWhatsappPhoneNumbers,
  ({ one }) => ({
    staff: one(staff, {
      fields: [staffWhatsappPhoneNumbers.staffId],
      references: [staff.id],
    }),
  })
);

/**
 * Relations for staff WhatsApp activity log
 */
export const staffWhatsappActivityLogRelations = relations(staffWhatsappActivityLog, ({ one }) => ({
  staff: one(staff, {
    fields: [staffWhatsappActivityLog.staffId],
    references: [staff.id],
  }),
  organization: one(organizations, {
    fields: [staffWhatsappActivityLog.organizationId],
    references: [organizations.id],
  }),
}));
