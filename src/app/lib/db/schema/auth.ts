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

// New table for Gmail OAuth Tokens
export const gmailOAuthTokens = pgTable('gmail_oauth_tokens', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // Assuming one Gmail account per user
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(), // Refresh tokens are often long
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'), // Can store a string of scopes, or use .array() if multiple distinct scopes are common
  tokenType: varchar('token_type', { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// New table for Microsoft OAuth Tokens
export const microsoftOAuthTokens = pgTable('microsoft_oauth_tokens', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // Assuming one Microsoft account per user
  email: varchar('email', { length: 255 }).notNull(), // The Microsoft email address
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'), // Can store a string of scopes
  tokenType: varchar('token_type', { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Import needed tables for relations will be done at the bottom to avoid circular dependencies

// Relations will be defined after imports to avoid circular dependencies
import { posts } from './posts';
import { organizationMemberships } from './organizations';
import { staff } from './staff';

export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
  organizationMemberships: many(organizationMemberships),
  gmailOAuthToken: one(gmailOAuthTokens, {
    fields: [users.id],
    references: [gmailOAuthTokens.userId],
  }),
}));

export const gmailOAuthTokensRelations = relations(gmailOAuthTokens, ({ one, many }) => ({
  user: one(users, {
    fields: [gmailOAuthTokens.userId],
    references: [users.id],
  }),
  linkedStaff: many(staff),
}));

export const microsoftOAuthTokensRelations = relations(microsoftOAuthTokens, ({ one, many }) => ({
  user: one(users, {
    fields: [microsoftOAuthTokens.userId],
    references: [users.id],
  }),
  linkedStaff: many(staff),
}));
