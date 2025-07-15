import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';

import { donors } from './donors';
import { organizations } from './organizations';
import { users } from './auth';

/**
 * Person research table to store research sessions and results
 * Each person (donor) can have multiple research sessions, with one marked as "live"
 * All research data is stored as JSON for simplicity
 */
export const personResearch = pgTable('person_research', {
  id: serial('id').primaryKey(),
  donorId: integer('donor_id')
    .references(() => donors.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),

  // Core research data
  researchTopic: text('research_topic').notNull(),

  // Store the entire PersonResearchResult as JSON
  researchData: jsonb('research_data').notNull(), // Contains: answer, citations, summaries, totalLoops, totalSources, timestamp

  // Status and versioning
  isLive: boolean('is_live').default(false).notNull(), // Only one research per donor can be live
  version: integer('version').default(1).notNull(), // Version number for this donor

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Relations for person research table
 */
export const personResearchRelations = relations(personResearch, ({ one }) => ({
  donor: one(donors, {
    fields: [personResearch.donorId],
    references: [donors.id],
  }),
  organization: one(organizations, {
    fields: [personResearch.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [personResearch.userId],
    references: [users.id],
  }),
}));
