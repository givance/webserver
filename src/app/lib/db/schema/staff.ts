import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  unique,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { donors } from './donors';
import { communicationThreadStaff, communicationContent } from './communications';
import {
  staffWhatsappPhoneNumbers,
  whatsappChatHistory,
  staffWhatsappActivityLog,
} from './whatsapp';
import { staffEmailExamples } from './templates';

/**
 * Staff table to track organization staff members
 */
export const staff = pgTable(
  'staff',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    isRealPerson: boolean('is_real_person').default(true).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(), // Only one staff member per organization can be primary
    signature: text('signature'), // Rich text signature for emails
    writingInstructions: text('writing_instructions'), // Staff-specific writing instructions that override organizational defaults
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Email should be unique within each organization, not globally
    uniqueEmailPerOrg: unique('staff_email_organization_unique').on(
      table.email,
      table.organizationId
    ),
  })
);

// New table for Staff Gmail OAuth Tokens - separate from user tokens
export const staffGmailTokens = pgTable('staff_gmail_tokens', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id')
    .references(() => staff.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // One Gmail account per staff member
  email: varchar('email', { length: 255 }).notNull(), // The Gmail email address
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'), // OAuth scopes granted
  tokenType: varchar('token_type', { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// New table for Staff Microsoft OAuth Tokens - separate from user tokens
export const staffMicrosoftTokens = pgTable('staff_microsoft_tokens', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id')
    .references(() => staff.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // One Microsoft account per staff member
  email: varchar('email', { length: 255 }).notNull(), // The Microsoft email address
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'), // OAuth scopes granted
  tokenType: varchar('token_type', { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const staffRelations = relations(staff, ({ many, one }) => ({
  communicationThreads: many(communicationThreadStaff),
  sentMessages: many(communicationContent, { relationName: 'fromStaff' }),
  receivedMessages: many(communicationContent, { relationName: 'toStaff' }),
  organization: one(organizations, {
    fields: [staff.organizationId],
    references: [organizations.id],
  }),
  assignedDonors: many(donors, { relationName: 'assignedStaff' }),
  gmailToken: one(staffGmailTokens, {
    fields: [staff.id],
    references: [staffGmailTokens.staffId],
  }),
  microsoftToken: one(staffMicrosoftTokens, {
    fields: [staff.id],
    references: [staffMicrosoftTokens.staffId],
  }),
  whatsappPhoneNumbers: many(staffWhatsappPhoneNumbers),
  whatsappChatHistory: many(whatsappChatHistory),
  whatsappActivityLog: many(staffWhatsappActivityLog),
  emailExamples: many(staffEmailExamples),
}));

export const staffGmailTokensRelations = relations(staffGmailTokens, ({ one }) => ({
  staff: one(staff, {
    fields: [staffGmailTokens.staffId],
    references: [staff.id],
  }),
}));

export const staffMicrosoftTokensRelations = relations(staffMicrosoftTokens, ({ one }) => ({
  staff: one(staff, {
    fields: [staffMicrosoftTokens.staffId],
    references: [staff.id],
  }),
}));
