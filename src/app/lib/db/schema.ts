import { relations, sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, varchar, boolean, integer, primaryKey } from "drizzle-orm/pg-core";

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
