import { relations, sql } from 'drizzle-orm';
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

import { genderEnum } from './enums';
import { DonorNote } from './types';
import { organizations } from './organizations';
import { staff } from './staff';
import { users } from './auth';
import { donations } from './projects';
import { communicationThreadDonors, communicationContent } from './communications';
import { personResearch } from './research';

/**
 * Donors table to store donor information
 * Updated to support couple information from CSV imports
 */
export const donors = pgTable(
  'donors',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),

    // External ID from CRM systems - unique within organization
    externalId: varchar('external_id', { length: 255 }),

    // Legacy fields for backward compatibility (still required for now)
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),

    // New fields to support couple structure from CSV
    hisTitle: varchar('his_title', { length: 50 }), // Mr., Dr., Rabbi, etc.
    hisFirstName: varchar('his_first_name', { length: 255 }),
    hisInitial: varchar('his_initial', { length: 10 }),
    hisLastName: varchar('his_last_name', { length: 255 }), // His last name (may be different)

    herTitle: varchar('her_title', { length: 50 }), // Mrs., Ms., Dr., etc.
    herFirstName: varchar('her_first_name', { length: 255 }),
    herInitial: varchar('her_initial', { length: 10 }),
    herLastName: varchar('her_last_name', { length: 255 }), // Her last name (may be different)

    // Display name for communications (e.g., "Mr. and Mrs. Smith", "Dr. John and Mrs. Jane Doe")
    displayName: varchar('display_name', { length: 500 }),

    // Indicator if this is a couple record or individual
    isCouple: boolean('is_couple').default(false).notNull(),

    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    address: text('address'),
    state: varchar('state', { length: 50 }),
    gender: genderEnum('gender'), // For individual donors
    notes: jsonb('notes')
      .$type<DonorNote[]>()
      .default(sql`'[]'::jsonb`),
    assignedToStaffId: integer('assigned_to_staff_id').references(() => staff.id),
    currentStageName: varchar('current_stage_name', { length: 255 }),
    classificationReasoning: text('classification_reasoning'),
    predictedActions: jsonb('predicted_actions'),
    // Research-derived fields from person research
    highPotentialDonor: boolean('high_potential_donor').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Email should be unique within each organization, not globally
    uniqueEmailPerOrg: unique('donors_email_organization_unique').on(
      table.email,
      table.organizationId
    ),
    // External ID should be unique within each organization when provided
    uniqueExternalIdPerOrg: unique('donors_external_id_organization_unique').on(
      table.externalId,
      table.organizationId
    ),
  })
);

/**
 * Donor lists table to store named collections of donors
 */
export const donorLists = pgTable(
  'donor_lists',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Name should be unique within each organization
    uniqueNamePerOrg: unique('donor_lists_name_organization_unique').on(
      table.name,
      table.organizationId
    ),
  })
);

/**
 * Donor list members table to store the many-to-many relationship between lists and donors
 */
export const donorListMembers = pgTable(
  'donor_list_members',
  {
    id: serial('id').primaryKey(),
    listId: integer('list_id')
      .references(() => donorLists.id, { onDelete: 'cascade' })
      .notNull(),
    donorId: integer('donor_id')
      .references(() => donors.id, { onDelete: 'cascade' })
      .notNull(),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (table) => ({
    // Each donor can only be in a list once
    uniqueDonorPerList: unique('donor_list_members_donor_list_unique').on(
      table.listId,
      table.donorId
    ),
  })
);

export const donorsRelations = relations(donors, ({ many, one }) => ({
  donations: many(donations),
  communicationThreads: many(communicationThreadDonors),
  sentMessages: many(communicationContent, { relationName: 'fromDonor' }),
  receivedMessages: many(communicationContent, { relationName: 'toDonor' }),
  personResearch: many(personResearch),
  organization: one(organizations, {
    fields: [donors.organizationId],
    references: [organizations.id],
  }),
  assignedStaff: one(staff, {
    fields: [donors.assignedToStaffId],
    references: [staff.id],
    relationName: 'assignedStaff',
  }),
}));

/**
 * Relations for donor lists tables
 */
export const donorListsRelations = relations(donorLists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [donorLists.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [donorLists.createdBy],
    references: [users.id],
  }),
  members: many(donorListMembers),
}));

export const donorListMembersRelations = relations(donorListMembers, ({ one }) => ({
  list: one(donorLists, {
    fields: [donorListMembers.listId],
    references: [donorLists.id],
  }),
  donor: one(donors, {
    fields: [donorListMembers.donorId],
    references: [donors.id],
  }),
  addedByUser: one(users, {
    fields: [donorListMembers.addedBy],
    references: [users.id],
  }),
}));
