import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

import { donors } from './donors';
import { staff } from './staff';
import { organizations } from './organizations';

export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  type: text('type').notNull(), // e.g. 'PREDICTED_ACTION', 'MANUAL', etc.
  status: text('status').notNull().default('PENDING'), // 'PENDING', 'IN_PROGRESS', 'COMPLETED', etc.
  priority: text('priority').notNull().default('MEDIUM'), // 'LOW', 'MEDIUM', 'HIGH'
  dueDate: timestamp('due_date'),
  scheduledDate: timestamp('scheduled_date'),
  completedDate: timestamp('completed_date'),

  // Relations
  donorId: integer('donor_id').references(() => donors.id, { onDelete: 'cascade' }),
  staffId: integer('staff_id').references(() => staff.id, { onDelete: 'set null' }),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Additional fields for predicted actions
  explanation: text('explanation'), // Reasoning behind the predicted action
});

// Add relations to existing tables if needed
export const todosRelations = relations(todos, ({ one }) => ({
  donor: one(donors, {
    fields: [todos.donorId],
    references: [donors.id],
  }),
  staff: one(staff, {
    fields: [todos.staffId],
    references: [staff.id],
  }),
  organization: one(organizations, {
    fields: [todos.organizationId],
    references: [organizations.id],
  }),
}));
