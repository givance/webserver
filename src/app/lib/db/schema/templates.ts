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
} from 'drizzle-orm/pg-core';

import { emailExampleCategoryEnum } from './enums';
import { organizations } from './organizations';
import { staff } from './staff';
import { emailGenerationSessions } from './campaigns';

/**
 * Templates table to store reusable communication prompts
 */
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  prompt: text('prompt').notNull(), // The actual template content/prompt
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Staff email examples table to store example emails for AI reference
 */
export const staffEmailExamples = pgTable('staff_email_examples', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id')
    .references(() => staff.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  category: emailExampleCategoryEnum('category').default('general'),
  metadata: jsonb('metadata'), // Optional metadata for future use
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Relations for templates
 */
export const templatesRelations = relations(templates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [templates.organizationId],
    references: [organizations.id],
  }),
  emailGenerationSessions: many(emailGenerationSessions),
}));

/**
 * Relations for staff email examples
 */
export const staffEmailExamplesRelations = relations(staffEmailExamples, ({ one }) => ({
  staff: one(staff, {
    fields: [staffEmailExamples.staffId],
    references: [staff.id],
  }),
  organization: one(organizations, {
    fields: [staffEmailExamples.organizationId],
    references: [organizations.id],
  }),
}));
