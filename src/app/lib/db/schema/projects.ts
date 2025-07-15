import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { donors } from './donors';

/**
 * Projects table to track different initiatives or campaigns
 */
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  notes: text('notes'), // Additional notes about the project
  active: boolean('active').default(true).notNull(),
  goal: integer('goal'), // Amount in cents
  tags: text('tags').array(), // Array of tags
  external: boolean('external').default(false).notNull(), // Whether this project represents external donations
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Donations table to track financial contributions
 */
export const donations = pgTable('donations', {
  id: serial('id').primaryKey(),
  donorId: integer('donor_id')
    .references(() => donors.id)
    .notNull(),
  projectId: integer('project_id')
    .references(() => projects.id)
    .notNull(),
  date: timestamp('date').defaultNow().notNull(),
  amount: integer('amount').notNull(), // Stored in cents
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Add relations for the new tables
export const projectsRelations = relations(projects, ({ many, one }) => ({
  donations: many(donations),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  donor: one(donors, {
    fields: [donations.donorId],
    references: [donors.id],
  }),
  project: one(projects, {
    fields: [donations.projectId],
    references: [projects.id],
  }),
}));
