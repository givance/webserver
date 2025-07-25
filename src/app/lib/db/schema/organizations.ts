import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  primaryKey,
  serial,
  varchar,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Organizations table based on Clerk organization data.
 */
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(), // Clerk Organization ID
  name: text('name').notNull(),
  slug: text('slug'),
  imageUrl: text('image_url'),
  createdBy: text('created_by'), // Clerk User ID of the creator
  websiteUrl: text('website_url'),
  websiteSummary: text('website_summary'),
  description: text('description'),
  shortDescription: text('short_description'),
  writingInstructions: text('writing_instructions'),
  donorJourneyText: text('donor_journey_text'),
  donorJourney: jsonb('donor_journey').default(sql`'{"nodes": [], "edges": []}'::jsonb`), // JSON object for donor journey graph
  memory: text('memory')
    .array()
    .default(sql`'{}'::text[]`), // Array of strings for organization memory, default empty array
  featureFlags: jsonb('feature_flags').default(
    sql`'{"use_o3_model": false, "use_agentic_flow": false}'::jsonb`
  ), // Feature flags for the organization
  createdAt: timestamp('created_at')
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at')
    .default(sql`now()`)
    .notNull(),
});

/**
 * Join table for users and organizations, representing memberships.
 */
export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // e.g., 'admin', 'basic_member'
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at')
      .default(sql`now()`)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
  })
);

/**
 * Organization integrations table for storing CRM and other external system connections.
 * Supports multiple providers (Blackbaud, Salesforce, HubSpot, etc.) per organization.
 */
export const organizationIntegrations = pgTable(
  'organization_integrations',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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
    // Only one integration per provider per organization
    uniqueProviderPerOrg: unique('org_provider_unique').on(table.organizationId, table.provider),
  })
);

// Import needed tables for relations will be done at the bottom to avoid circular dependencies

// Relations will be defined after imports to avoid circular dependencies
import { users } from './auth';
import { projects } from './projects';
import { donors } from './donors';
import { staff } from './staff';

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  organizationMemberships: many(organizationMemberships),
  createdByUser: one(users, {
    fields: [organizations.createdBy],
    references: [users.id],
    relationName: 'organizationCreator', // Added relation name for clarity
  }),
  projects: many(projects),
  donors: many(donors),
  staff: many(staff),
  integrations: many(organizationIntegrations),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMemberships.userId],
    references: [users.id],
  }),
}));

export const organizationIntegrationsRelations = relations(organizationIntegrations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationIntegrations.organizationId],
    references: [organizations.id],
  }),
}));
