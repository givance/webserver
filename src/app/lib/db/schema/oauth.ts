import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * OAuth PKCE verifiers table for storing temporary PKCE code verifiers
 * during the OAuth flow. These are short-lived records that get cleaned up
 * after use or expiration.
 */
export const oauthPkceVerifiers = pgTable('oauth_pkce_verifiers', {
  state: text('state').primaryKey(), // OAuth state parameter
  verifier: text('verifier').notNull(), // PKCE code verifier
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
