import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';

import { communicationChannelEnum } from './enums';
import { staff } from './staff';
import { donors } from './donors';

/**
 * Communication threads table to group related communications
 */
export const communicationThreads = pgTable('communication_threads', {
  id: serial('id').primaryKey(),
  channel: communicationChannelEnum('channel').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Join table for communication threads and staff
 */
export const communicationThreadStaff = pgTable(
  'communication_thread_staff',
  {
    threadId: integer('thread_id')
      .references(() => communicationThreads.id, { onDelete: 'cascade' })
      .notNull(),
    staffId: integer('staff_id')
      .references(() => staff.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.threadId, t.staffId] }),
  })
);

/**
 * Join table for communication threads and donors
 */
export const communicationThreadDonors = pgTable(
  'communication_thread_donors',
  {
    threadId: integer('thread_id')
      .references(() => communicationThreads.id, { onDelete: 'cascade' })
      .notNull(),
    donorId: integer('donor_id')
      .references(() => donors.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.threadId, t.donorId] }),
  })
);

/**
 * Communication content table to store individual messages
 */
export const communicationContent = pgTable('communication_content', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id')
    .references(() => communicationThreads.id)
    .notNull(),
  content: text('content').notNull(),
  datetime: timestamp('datetime').defaultNow().notNull(),
  fromStaffId: integer('from_staff_id').references(() => staff.id),
  fromDonorId: integer('from_donor_id').references(() => donors.id),
  toStaffId: integer('to_staff_id').references(() => staff.id),
  toDonorId: integer('to_donor_id').references(() => donors.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const communicationThreadStaffRelations = relations(communicationThreadStaff, ({ one }) => ({
  thread: one(communicationThreads, {
    fields: [communicationThreadStaff.threadId],
    references: [communicationThreads.id],
  }),
  staff: one(staff, {
    fields: [communicationThreadStaff.staffId],
    references: [staff.id],
  }),
}));

export const communicationThreadDonorsRelations = relations(
  communicationThreadDonors,
  ({ one }) => ({
    thread: one(communicationThreads, {
      fields: [communicationThreadDonors.threadId],
      references: [communicationThreads.id],
    }),
    donor: one(donors, {
      fields: [communicationThreadDonors.donorId],
      references: [donors.id],
    }),
  })
);

export const communicationThreadsRelations = relations(communicationThreads, ({ many }) => ({
  staff: many(communicationThreadStaff),
  donors: many(communicationThreadDonors),
  content: many(communicationContent),
}));

export const communicationContentRelations = relations(communicationContent, ({ one }) => ({
  thread: one(communicationThreads, {
    fields: [communicationContent.threadId],
    references: [communicationThreads.id],
  }),
  fromStaff: one(staff, {
    fields: [communicationContent.fromStaffId],
    references: [staff.id],
    relationName: 'fromStaff',
  }),
  fromDonor: one(donors, {
    fields: [communicationContent.fromDonorId],
    references: [donors.id],
    relationName: 'fromDonor',
  }),
  toStaff: one(staff, {
    fields: [communicationContent.toStaffId],
    references: [staff.id],
    relationName: 'toStaff',
  }),
  toDonor: one(donors, {
    fields: [communicationContent.toDonorId],
    references: [donors.id],
    relationName: 'toDonor',
  }),
}));
