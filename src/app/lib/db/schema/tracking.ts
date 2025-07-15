import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core';

import { generatedEmails } from './campaigns';
import { donors } from './donors';
import { organizations } from './organizations';
import { emailGenerationSessions } from './campaigns';

/**
 * Email tracking tables for open and click tracking
 */

/**
 * Email trackers table to store tracking metadata for each sent email
 */
export const emailTrackers = pgTable('email_trackers', {
  id: text('id').primaryKey(), // UUID for tracking
  emailId: integer('email_id')
    .references(() => generatedEmails.id, { onDelete: 'cascade' })
    .notNull(),
  donorId: integer('donor_id')
    .references(() => donors.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  sessionId: integer('session_id')
    .references(() => emailGenerationSessions.id, { onDelete: 'cascade' })
    .notNull(),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Link trackers table to store tracking metadata for each link in emails
 */
export const linkTrackers = pgTable('link_trackers', {
  id: text('id').primaryKey(), // UUID for tracking
  emailTrackerId: text('email_tracker_id')
    .references(() => emailTrackers.id, { onDelete: 'cascade' })
    .notNull(),
  originalUrl: text('original_url').notNull(),
  linkText: text('link_text'), // The text of the link for context
  position: integer('position').notNull(), // Position of link in email content
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Email opens table to track when emails are opened
 */
export const emailOpens = pgTable('email_opens', {
  id: serial('id').primaryKey(),
  emailTrackerId: text('email_tracker_id')
    .references(() => emailTrackers.id, { onDelete: 'cascade' })
    .notNull(),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 support
  userAgent: text('user_agent'),
  referer: text('referer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Link clicks table to track when links are clicked
 */
export const linkClicks = pgTable('link_clicks', {
  id: serial('id').primaryKey(),
  linkTrackerId: text('link_tracker_id')
    .references(() => linkTrackers.id, { onDelete: 'cascade' })
    .notNull(),
  clickedAt: timestamp('clicked_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 support
  userAgent: text('user_agent'),
  referer: text('referer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Relations for email tracking tables
 */
export const emailTrackersRelations = relations(emailTrackers, ({ one, many }) => ({
  email: one(generatedEmails, {
    fields: [emailTrackers.emailId],
    references: [generatedEmails.id],
  }),
  donor: one(donors, {
    fields: [emailTrackers.donorId],
    references: [donors.id],
  }),
  organization: one(organizations, {
    fields: [emailTrackers.organizationId],
    references: [organizations.id],
  }),
  session: one(emailGenerationSessions, {
    fields: [emailTrackers.sessionId],
    references: [emailGenerationSessions.id],
  }),
  linkTrackers: many(linkTrackers),
  emailOpens: many(emailOpens),
}));

export const linkTrackersRelations = relations(linkTrackers, ({ one, many }) => ({
  emailTracker: one(emailTrackers, {
    fields: [linkTrackers.emailTrackerId],
    references: [emailTrackers.id],
  }),
  linkClicks: many(linkClicks),
}));

export const emailOpensRelations = relations(emailOpens, ({ one }) => ({
  emailTracker: one(emailTrackers, {
    fields: [emailOpens.emailTrackerId],
    references: [emailTrackers.id],
  }),
}));

export const linkClicksRelations = relations(linkClicks, ({ one }) => ({
  linkTracker: one(linkTrackers, {
    fields: [linkClicks.linkTrackerId],
    references: [linkTrackers.id],
  }),
}));
