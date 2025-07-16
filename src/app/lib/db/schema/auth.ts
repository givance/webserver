import { relations, sql } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Users table, adapted for Clerk user data.
 * Clerk User ID is stored in 'id'.
 * The original serial 'id' is removed to use Clerk's text ID as primary key.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk User ID
  firstName: text('first_name'), // From Clerk
  lastName: text('last_name'), // From Clerk
  email: varchar('email', { length: 255 }).notNull().unique(), // Kept from original, ensure it matches Clerk's primary email
  profileImageUrl: text('profile_image_url'), // From Clerk
  emailSignature: text('email_signature'), // User's email signature for generated emails
  // name: varchar("name", { length: 255 }).notNull(), // Original 'name' field, can be removed if using firstName/lastName
  memory: text('memory').array(), // Array of strings for user memory
  dismissedMemories: text('dismissed_memories').array(), // Array of strings for user dismissed memories
  stages: text('stages').array(), // Array of strings for user stages
  createdAt: timestamp('created_at')
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
  updatedAt: timestamp('updated_at')
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
});

// Note: Gmail and Microsoft OAuth token tables have been removed.
// The system now uses staff-level authentication (staffGmailTokens and staffMicrosoftTokens)
// which are defined in the staff schema file.

// Import needed tables for relations will be done at the bottom to avoid circular dependencies

// Relations will be defined after imports to avoid circular dependencies
import { posts } from './posts';
import { organizationMemberships } from './organizations';
import { staff } from './staff';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  organizationMemberships: many(organizationMemberships),
}));
