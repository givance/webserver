import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { users } from './auth';

// Signature images table for storing base64 encoded images
export const signatureImages = pgTable('signature_images', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  base64Data: text('base64_data').notNull(),
  size: integer('size').notNull(), // File size in bytes
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const signatureImagesRelations = relations(signatureImages, ({ one }) => ({
  organization: one(organizations, {
    fields: [signatureImages.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [signatureImages.userId],
    references: [users.id],
  }),
}));
