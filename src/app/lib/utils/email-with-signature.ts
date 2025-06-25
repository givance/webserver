import { db } from "@/app/lib/db";
import { staff, donors, users } from "@/app/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/app/lib/logger";

interface EmailPiece {
  piece: string;
  references: string[];
  addNewlineAfter: boolean;
}

interface SignatureOptions {
  donorId: number;
  organizationId: string;
  userId?: string;
  customSignature?: string;
}

/**
 * Appends the appropriate signature to email structured content
 * without modifying the original content array
 */
export async function appendSignatureToEmail(
  structuredContent: EmailPiece[],
  options: SignatureOptions
): Promise<EmailPiece[]> {
  const { donorId, organizationId, userId, customSignature } = options;

  // If custom signature is provided, use it
  if (customSignature && customSignature.trim()) {
    logger.info(`Using provided custom signature for donor ${donorId}`);
    return [
      ...structuredContent,
      {
        piece: customSignature,
        references: ["signature"],
        addNewlineAfter: false,
      },
    ];
  }

  try {
    // Get donor with assigned staff
    const donor = await db.query.donors.findFirst({
      where: and(
        eq(donors.id, donorId),
        eq(donors.organizationId, organizationId)
      ),
      with: {
        assignedStaff: true,
      },
    });

    if (!donor) {
      logger.warn(`Donor ${donorId} not found for signature`);
      return structuredContent;
    }

    let signature: string;
    let signatureSource: string;

    // Determine signature based on assigned staff
    if (donor.assignedStaff?.signature && donor.assignedStaff.signature.trim()) {
      signature = donor.assignedStaff.signature;
      signatureSource = `custom signature from assigned staff ${donor.assignedStaff.firstName} ${donor.assignedStaff.lastName}`;
    } else if (donor.assignedStaff) {
      signature = `Best,\n${donor.assignedStaff.firstName}`;
      signatureSource = `default format for assigned staff ${donor.assignedStaff.firstName} ${donor.assignedStaff.lastName}`;
    } else {
      // Get primary staff as fallback
      const primaryStaff = await db.query.staff.findFirst({
        where: and(
          eq(staff.organizationId, organizationId),
          eq(staff.isPrimary, true)
        ),
      });

      if (primaryStaff?.signature && primaryStaff.signature.trim()) {
        signature = primaryStaff.signature;
        signatureSource = `custom signature from primary staff ${primaryStaff.firstName} ${primaryStaff.lastName}`;
      } else if (primaryStaff) {
        signature = `Best,\n${primaryStaff.firstName}`;
        signatureSource = `default format for primary staff ${primaryStaff.firstName} ${primaryStaff.lastName}`;
      } else {
        // Final fallback
        if (userId) {
          const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
          });
          
          if (user?.emailSignature) {
            signature = user.emailSignature;
            signatureSource = "user email signature";
          } else {
            signature = `Best,\n${user?.firstName || "Team"}`;
            signatureSource = "default fallback signature";
          }
        } else {
          signature = "Best,\nTeam";
          signatureSource = "default team signature";
        }
      }
    }

    logger.info(`Email for donor ${donorId}: Using ${signatureSource}`);

    // Append signature to content
    return [
      ...structuredContent,
      {
        piece: signature,
        references: ["signature"],
        addNewlineAfter: false,
      },
    ];
  } catch (error) {
    logger.error(
      `Failed to append signature for donor ${donorId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Return original content on error
    return structuredContent;
  }
}

/**
 * Removes signature pieces from structured content
 */
export function removeSignatureFromContent(structuredContent: EmailPiece[]): EmailPiece[] {
  return structuredContent.filter(piece => !piece.references?.includes("signature"));
}