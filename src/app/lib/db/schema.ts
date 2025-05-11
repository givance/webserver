import { relations, sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, varchar, boolean, integer, primaryKey, pgEnum } from "drizzle-orm/pg-core";

/**
 * Users table, adapted for Clerk user data.
 * Clerk User ID is stored in 'id'.
 * The original serial 'id' is removed to use Clerk's text ID as primary key.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk User ID
  firstName: text("first_name"), // From Clerk
  lastName: text("last_name"), // From Clerk
  email: varchar("email", { length: 255 }).notNull().unique(), // Kept from original, ensure it matches Clerk's primary email
  profileImageUrl: text("profile_image_url"), // From Clerk
  // name: varchar("name", { length: 255 }).notNull(), // Original 'name' field, can be removed if using firstName/lastName
  createdAt: timestamp("created_at")
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
  updatedAt: timestamp("updated_at")
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  organizationMemberships: many(organizationMemberships),
}));

/**
 * Example schema for a posts table with a relation to users
 * Note: authorId now needs to be text to reference the new users.id
 */
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  published: boolean("published").default(false).notNull(),
  authorId: text("author_id") // Changed from integer to text
    .references(() => users.id) // References the text ID of users table
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Organizations table based on Clerk organization data.
 */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(), // Clerk Organization ID
  name: text("name").notNull(),
  slug: text("slug"),
  imageUrl: text("image_url"),
  createdBy: text("created_by"), // Clerk User ID of the creator
  createdAt: timestamp("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`now()`)
    .notNull(),
});

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  organizationMemberships: many(organizationMemberships),
  createdByUser: one(users, {
    fields: [organizations.createdBy],
    references: [users.id],
    relationName: "organizationCreator", // Added relation name for clarity
  }),
}));

/**
 * Join table for users and organizations, representing memberships.
 */
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // e.g., 'admin', 'basic_member'
    createdAt: timestamp("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
  })
);

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

/**
 * Projects table to track different initiatives or campaigns
 */
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Donors table to store donor information
 */
export const donors = pgTable("donors", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  state: varchar("state", { length: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Donations table to track financial contributions
 */
export const donations = pgTable("donations", {
  id: serial("id").primaryKey(),
  donorId: integer("donor_id")
    .references(() => donors.id)
    .notNull(),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  date: timestamp("date").defaultNow().notNull(),
  amount: integer("amount").notNull(), // Stored in cents
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Staff table to track organization staff members
 */
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  isRealPerson: boolean("is_real_person").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Communication channel enum
 */
export const communicationChannelEnum = pgEnum("communication_channel", ["email", "phone", "text"]);

/**
 * Communication threads table to group related communications
 */
export const communicationThreads = pgTable("communication_threads", {
  id: serial("id").primaryKey(),
  channel: communicationChannelEnum("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Join table for communication threads and staff
 */
export const communicationThreadStaff = pgTable(
  "communication_thread_staff",
  {
    threadId: integer("thread_id")
      .references(() => communicationThreads.id, { onDelete: "cascade" })
      .notNull(),
    staffId: integer("staff_id")
      .references(() => staff.id, { onDelete: "cascade" })
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
  "communication_thread_donors",
  {
    threadId: integer("thread_id")
      .references(() => communicationThreads.id, { onDelete: "cascade" })
      .notNull(),
    donorId: integer("donor_id")
      .references(() => donors.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.threadId, t.donorId] }),
  })
);

/**
 * Communication content table to store individual messages
 */
export const communicationContent = pgTable("communication_content", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => communicationThreads.id)
    .notNull(),
  content: text("content").notNull(),
  datetime: timestamp("datetime").defaultNow().notNull(),
  fromStaffId: integer("from_staff_id").references(() => staff.id),
  fromDonorId: integer("from_donor_id").references(() => donors.id),
  toStaffId: integer("to_staff_id").references(() => staff.id),
  toDonorId: integer("to_donor_id").references(() => donors.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Add relations for the new tables
export const projectsRelations = relations(projects, ({ many }) => ({
  donations: many(donations),
}));

export const donorsRelations = relations(donors, ({ many }) => ({
  donations: many(donations),
  communicationThreads: many(communicationThreadDonors),
  sentMessages: many(communicationContent, { relationName: "fromDonor" }),
  receivedMessages: many(communicationContent, { relationName: "toDonor" }),
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

export const staffRelations = relations(staff, ({ many }) => ({
  communicationThreads: many(communicationThreadStaff),
  sentMessages: many(communicationContent, { relationName: "fromStaff" }),
  receivedMessages: many(communicationContent, { relationName: "toStaff" }),
}));

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
    relationName: "fromStaff",
  }),
  fromDonor: one(donors, {
    fields: [communicationContent.fromDonorId],
    references: [donors.id],
    relationName: "fromDonor",
  }),
  toStaff: one(staff, {
    fields: [communicationContent.toStaffId],
    references: [staff.id],
    relationName: "toStaff",
  }),
  toDonor: one(donors, {
    fields: [communicationContent.toDonorId],
    references: [donors.id],
    relationName: "toDonor",
  }),
}));
