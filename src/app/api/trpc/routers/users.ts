import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  getUserById,
  updateUserMemory,
  addDismissedMemory,
  updateUserEmailSignature,
} from '@/app/lib/data/users';
import { db } from '@/app/lib/db';
import { signatureImages } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '@/app/lib/env';
import { createTRPCError, notFoundError, ERROR_MESSAGES, check, validateNotNullish } from '../trpc';
import { idSchema } from '@/app/lib/validation/schemas';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * User response schema
 */
const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  memory: z.array(z.string()),
  dismissedMemories: z.array(z.string()),
  emailSignature: z.string().nullable(),
  organizationId: z.string().nullable(),
  createdAt: z.string(), // ISO string
  updatedAt: z.string(), // ISO string
});

/**
 * Signature image schema
 */
const signatureImageSchema = z.object({
  id: idSchema,
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int().positive(),
  dataUrl: z.string().url(),
  createdAt: z.date(),
});

/**
 * Signature image response schema (with ISO dates)
 */
const signatureImageResponseSchema = signatureImageSchema.extend({
  createdAt: z.string(), // ISO string
});

// Input schemas
const updateMemorySchema = z.object({
  memory: z.array(z.string().max(1000)).max(100),
});

const dismissMemorySchema = z.object({
  memory: z.string().max(1000),
});

const updateSignatureSchema = z.object({
  signature: z.string().max(10000),
});

const uploadSignatureImageSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024), // 5MB max
});

const imageIdSchema = z.object({
  imageId: idSchema,
});

// Constants
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// ============================================================================
// Helpers
// ============================================================================

/**
 * Serialize user dates to ISO strings
 */
const serializeUser = (user: any): z.infer<typeof userResponseSchema> => ({
  ...user,
  createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
});

/**
 * Serialize signature image dates to ISO strings
 */
const serializeSignatureImage = (image: any): z.infer<typeof signatureImageResponseSchema> => ({
  ...image,
  createdAt: image.createdAt instanceof Date ? image.createdAt.toISOString() : image.createdAt,
});

/**
 * Get hosted URL for signature image
 */
const getHostedImageUrl = (imageId: number): string => {
  const baseUrl = env.BASE_URL || 'https://app.givance.ai';
  return `${baseUrl}/api/signature-image/${imageId}`;
};

// ============================================================================
// Router Definition
// ============================================================================

export const usersRouter = router({
  /**
   * Get the current user's details
   *
   * @returns User data including memory and email signature
   *
   * @throws {TRPCError} NOT_FOUND if user doesn't exist
   */
  getCurrent: protectedProcedure.output(userResponseSchema).query(async ({ ctx }) => {
    const user = await getUserById(ctx.auth.user.id);

    validateNotNullish(user, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('User'));

    return serializeUser(user);
  }),

  /**
   * Update the user's memory array
   *
   * @param memory - Array of memory strings to store
   *
   * @returns Updated user data
   *
   * @throws {TRPCError} NOT_FOUND if user doesn't exist
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   */
  updateMemory: protectedProcedure
    .input(updateMemorySchema)
    .output(userResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const updated = await updateUserMemory(ctx.auth.user.id, input.memory);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('User'));

      return serializeUser(updated);
    }),

  /**
   * Dismiss a memory item
   *
   * @param memory - Memory string to dismiss
   *
   * @returns Updated user data
   *
   * @throws {TRPCError} NOT_FOUND if user doesn't exist
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   */
  dismissMemory: protectedProcedure
    .input(dismissMemorySchema)
    .output(userResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const updated = await addDismissedMemory(ctx.auth.user.id, input.memory);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('User'));

      return serializeUser(updated);
    }),

  /**
   * Update the user's email signature
   *
   * @param signature - HTML email signature
   *
   * @returns Updated user data
   *
   * @throws {TRPCError} NOT_FOUND if user doesn't exist
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   */
  updateEmailSignature: protectedProcedure
    .input(updateSignatureSchema)
    .output(userResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const updated = await updateUserEmailSignature(ctx.auth.user.id, input.signature);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('User'));

      return serializeUser(updated);
    }),

  /**
   * Upload a signature image
   *
   * @param filename - Original filename
   * @param mimeType - Image MIME type
   * @param base64Data - Base64 encoded image data
   * @param size - File size in bytes
   *
   * @returns Uploaded image details with hosted URL
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   * @throws {TRPCError} BAD_REQUEST if file is too large or invalid type
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if upload fails
   */
  uploadSignatureImage: protectedProcedure
    .input(uploadSignatureImageSchema)
    .output(signatureImageResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { organizationId } = ctx.auth.user;

      validateNotNullish(organizationId, 'UNAUTHORIZED', 'User must belong to an organization');

      // Validate file size
      if (input.size > MAX_IMAGE_SIZE) {
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'File size too large. Maximum 5MB allowed.',
          logLevel: 'info',
        });
      }

      // Validate MIME type
      if (!ALLOWED_IMAGE_TYPES.includes(input.mimeType)) {
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.',
          logLevel: 'info',
        });
      }

      const [image] = await db
        .insert(signatureImages)
        .values({
          organizationId,
          userId: ctx.auth.user.id,
          filename: input.filename,
          mimeType: input.mimeType,
          base64Data: input.base64Data,
          size: input.size,
        })
        .returning();

      validateNotNullish(image, 'INTERNAL_SERVER_ERROR', 'Failed to save image');

      return serializeSignatureImage({
        ...image,
        dataUrl: getHostedImageUrl(image.id),
      });
    }),

  /**
   * Get all signature images for the current user
   *
   * @returns List of signature images without base64 data
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   */
  getSignatureImages: protectedProcedure
    .output(z.array(signatureImageResponseSchema.omit({ dataUrl: true })))
    .query(async ({ ctx }) => {
      const { organizationId } = ctx.auth.user;

      validateNotNullish(organizationId, 'UNAUTHORIZED', 'User must belong to an organization');

      const images = await db
        .select({
          id: signatureImages.id,
          filename: signatureImages.filename,
          mimeType: signatureImages.mimeType,
          size: signatureImages.size,
          createdAt: signatureImages.createdAt,
        })
        .from(signatureImages)
        .where(
          and(
            eq(signatureImages.organizationId, organizationId),
            eq(signatureImages.userId, ctx.auth.user.id)
          )
        )
        .orderBy(signatureImages.createdAt);

      return images.map(serializeSignatureImage);
    }),

  /**
   * Get a signature image by ID with hosted URL
   *
   * @param imageId - Signature image ID
   *
   * @returns Image details with hosted URL
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   * @throws {TRPCError} NOT_FOUND if image doesn't exist
   */
  getSignatureImageData: protectedProcedure
    .input(imageIdSchema)
    .output(signatureImageResponseSchema)
    .query(async ({ input, ctx }) => {
      const { organizationId } = ctx.auth.user;

      validateNotNullish(organizationId, 'UNAUTHORIZED', 'User must belong to an organization');

      const [image] = await db
        .select()
        .from(signatureImages)
        .where(
          and(
            eq(signatureImages.id, input.imageId),
            eq(signatureImages.organizationId, organizationId),
            eq(signatureImages.userId, ctx.auth.user.id)
          )
        )
        .limit(1);

      validateNotNullish(image, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Image'));

      return serializeSignatureImage({
        id: image.id,
        filename: image.filename,
        mimeType: image.mimeType,
        size: image.size,
        dataUrl: getHostedImageUrl(image.id),
        createdAt: image.createdAt,
      });
    }),

  /**
   * Delete a signature image
   *
   * @param imageId - Signature image ID to delete
   *
   * @returns Success status
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   * @throws {TRPCError} NOT_FOUND if image doesn't exist
   */
  deleteSignatureImage: protectedProcedure
    .input(imageIdSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { organizationId } = ctx.auth.user;

      validateNotNullish(organizationId, 'UNAUTHORIZED', 'User must belong to an organization');

      const [deleted] = await db
        .delete(signatureImages)
        .where(
          and(
            eq(signatureImages.id, input.imageId),
            eq(signatureImages.organizationId, organizationId),
            eq(signatureImages.userId, ctx.auth.user.id)
          )
        )
        .returning();

      validateNotNullish(deleted, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Image'));

      return { success: true };
    }),
});
