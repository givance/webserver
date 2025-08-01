import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  unique,
  jsonb,
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

/**
 * Staff integrations table for storing CRM and other external system connections.
 * Supports multiple providers (Blackbaud, Salesforce, HubSpot, etc.) per staff member.
 */
export const staffIntegrations = pgTable(
  'staff_integrations',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(), // 'blackbaud', 'salesforce', 'hubspot', etc.
    accessToken: text('access_token').notNull(), // Should be encrypted in production
    refreshToken: text('refresh_token').notNull(), // Should be encrypted in production
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    scope: text('scope'), // OAuth scopes granted
    tokenType: varchar('token_type', { length: 50 }), // e.g., 'Bearer'
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`), // Provider-specific data (environmentId, instanceUrl, etc.)
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    syncStatus: varchar('sync_status', { length: 20 }).default('idle'), // 'idle', 'syncing', 'error'
    syncError: text('sync_error'), // Last sync error message
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Only one integration per provider per staff member
    uniqueProviderPerStaff: unique('staff_provider_unique').on(table.staffId, table.provider),
  })
);

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
  integrations: many(staffIntegrations),
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

export const staffIntegrationsRelations = relations(staffIntegrations, ({ one }) => ({
  staff: one(staff, {
    fields: [staffIntegrations.staffId],
    references: [staff.id],
  }),
}));
