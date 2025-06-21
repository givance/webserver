import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getUserById, updateUserMemory, addDismissedMemory, updateUserEmailSignature } from "@/app/lib/data/users";
import { logger } from "@/app/lib/logger";
import { db } from "@/app/lib/db";
import { signatureImages } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/app/lib/env";

export const usersRouter = router({
  /**
   * Get the current user's details including memory
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.auth.user.id);
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }
    return user;
  }),

  /**
   * Update the user's memory array
   */
  updateMemory: protectedProcedure
    .input(
      z.object({
        memory: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const updated = await updateUserMemory(userId, input.memory);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        return updated;
      } catch (error) {
        logger.error(`Failed to update user memory: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user memory",
          cause: error,
        });
      }
    }),

  /**
   * Dismiss a memory item
   */
  dismissMemory: protectedProcedure
    .input(
      z.object({
        memory: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const updated = await addDismissedMemory(userId, input.memory);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        return updated;
      } catch (error) {
        logger.error(`Failed to dismiss memory: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dismiss memory",
          cause: error,
        });
      }
    }),

  /**
   * Update the user's email signature
   */
  updateEmailSignature: protectedProcedure
    .input(
      z.object({
        signature: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const updated = await updateUserEmailSignature(userId, input.signature);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        return updated;
      } catch (error) {
        logger.error(
          `Failed to update user email signature: ${error instanceof Error ? error.message : String(error)}`
        );
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user email signature",
          cause: error,
        });
      }
    }),

  /**
   * Upload a signature image (base64 encoded)
   */
  uploadSignatureImage: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        mimeType: z.string().min(1),
        base64Data: z.string().min(1),
        size: z.number().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const organizationId = ctx.auth.user.organizationId;

        if (!organizationId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "User must belong to an organization",
          });
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (input.size > maxSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File size too large. Maximum 5MB allowed.",
          });
        }

        // Validate MIME type
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
        if (!allowedTypes.includes(input.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.",
          });
        }

        const result = await db
          .insert(signatureImages)
          .values({
            organizationId,
            userId,
            filename: input.filename,
            mimeType: input.mimeType,
            base64Data: input.base64Data,
            size: input.size,
          })
          .returning();

        const image = result[0];
        if (!image) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save image",
          });
        }

        // Return the image with hosted URL instead of base64 data URL
        // This ensures the signature will have proper image URLs that work in emails
        const baseUrl = env.BASE_URL || "https://app.givance.ai";
        const hostedUrl = `${baseUrl}/api/signature-image/${image.id}`;
        
        return {
          id: image.id,
          filename: image.filename,
          mimeType: image.mimeType,
          size: image.size,
          dataUrl: hostedUrl, // Return hosted URL instead of base64
          createdAt: image.createdAt,
        };
      } catch (error) {
        logger.error(`Failed to upload signature image: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload signature image",
          cause: error,
        });
      }
    }),

  /**
   * Get all signature images for the current user
   */
  getSignatureImages: protectedProcedure.query(async ({ ctx }) => {
    try {
      const userId = ctx.auth.user.id;
      const organizationId = ctx.auth.user.organizationId;

      if (!organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User must belong to an organization",
        });
      }

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
            eq(signatureImages.userId, userId)
          )
        )
        .orderBy(signatureImages.createdAt);

      return images;
    } catch (error) {
      logger.error(`Failed to get signature images: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get signature images",
        cause: error,
      });
    }
  }),

  /**
   * Get a signature image by ID with base64 data
   */
  getSignatureImageData: protectedProcedure
    .input(z.object({ imageId: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const organizationId = ctx.auth.user.organizationId;

        if (!organizationId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "User must belong to an organization",
          });
        }

        const image = await db
          .select()
          .from(signatureImages)
          .where(
            and(
              eq(signatureImages.id, input.imageId),
              eq(signatureImages.organizationId, organizationId),
              eq(signatureImages.userId, userId)
            )
          )
          .limit(1);

        if (!image[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Image not found",
          });
        }

        const img = image[0];
        // Return hosted URL instead of base64 for better email compatibility
        const baseUrl = env.BASE_URL || "https://app.givance.ai";
        const hostedUrl = `${baseUrl}/api/signature-image/${img.id}`;
        
        return {
          id: img.id,
          filename: img.filename,
          mimeType: img.mimeType,
          size: img.size,
          dataUrl: hostedUrl, // Return hosted URL instead of base64
          createdAt: img.createdAt,
        };
      } catch (error) {
        logger.error(`Failed to get signature image data: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get signature image data",
          cause: error,
        });
      }
    }),

  /**
   * Delete a signature image
   */
  deleteSignatureImage: protectedProcedure
    .input(z.object({ imageId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.auth.user.id;
        const organizationId = ctx.auth.user.organizationId;

        if (!organizationId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "User must belong to an organization",
          });
        }

        const result = await db
          .delete(signatureImages)
          .where(
            and(
              eq(signatureImages.id, input.imageId),
              eq(signatureImages.organizationId, organizationId),
              eq(signatureImages.userId, userId)
            )
          )
          .returning();

        if (!result[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Image not found",
          });
        }

        return { success: true };
      } catch (error) {
        logger.error(`Failed to delete signature image: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete signature image",
          cause: error,
        });
      }
    }),
});
