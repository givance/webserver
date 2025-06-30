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

// Cache for signature results to avoid redundant database calls
const signatureCache = new Map<string, { signature: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Tracking for logging to avoid spam
const loggedSignatures = new Set<string>();

// Cleanup interval to prevent memory leaks
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of signatureCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL) {
        signatureCache.delete(key);
      }
    }

    // Clear logged signatures periodically to allow fresh logging
    if (loggedSignatures.size > 1000) {
      loggedSignatures.clear();
    }
  }, CACHE_TTL);
}

// Start cleanup when module loads
startCleanupInterval();

function getCacheKey(options: SignatureOptions): string {
  return `${options.donorId}-${options.organizationId}-${options.userId || "none"}-${
    options.customSignature || "none"
  }`;
}

function isValidCacheEntry(entry: { signature: string; timestamp: number }): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Gets the appropriate signature text for a donor
 * @param options - Signature options
 * @returns The signature text
 */
async function getSignatureText(options: SignatureOptions): Promise<string> {
  const { donorId, organizationId, userId, customSignature } = options;

  // If custom signature is provided, use it
  if (customSignature && customSignature.trim()) {
    // Only log once per session to avoid spam
    const logKey = `custom-${donorId}`;
    if (!loggedSignatures.has(logKey)) {
      logger.info(`Using provided custom signature for donor ${donorId}`);
      loggedSignatures.add(logKey);
    }
    return customSignature;
  }

  // Check cache first
  const cacheKey = getCacheKey(options);
  const cachedEntry = signatureCache.get(cacheKey);
  if (cachedEntry && isValidCacheEntry(cachedEntry)) {
    return cachedEntry.signature;
  }

  try {
    // Get donor with assigned staff
    const donor = await db.query.donors.findFirst({
      where: and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)),
      with: {
        assignedStaff: true,
      },
    });

    if (!donor) {
      logger.warn(`Donor ${donorId} not found for signature`);
      return "Best,\nTeam";
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
        where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
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

    // Cache the result
    signatureCache.set(cacheKey, { signature, timestamp: Date.now() });

    // Only log once per unique signature source to avoid spam
    const logKey = `${donorId}-${signatureSource}`;
    if (!loggedSignatures.has(logKey)) {
      logger.info(`Email for donor ${donorId}: Using ${signatureSource}`);
      loggedSignatures.add(logKey);
    }

    return signature;
  } catch (error) {
    logger.error(
      `Failed to get signature for donor ${donorId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return "Best,\nTeam";
  }
}

/**
 * Appends the appropriate signature to email structured content
 * without modifying the original content array
 */
export async function appendSignatureToEmail(
  structuredContent: EmailPiece[],
  options: SignatureOptions
): Promise<EmailPiece[]> {
  const signature = await getSignatureText(options);

  // Append signature to content
  return [
    ...structuredContent,
    {
      piece: signature,
      references: ["signature"],
      addNewlineAfter: false,
    },
  ];
}

/**
 * Appends the appropriate signature to plain text email content (for new format emails)
 * @param emailContent - The plain text email content
 * @param options - Signature options
 * @returns The email content with signature appended
 */
export async function appendSignatureToPlainText(emailContent: string, options: SignatureOptions): Promise<string> {
  const signature = await getSignatureText(options);

  // Add signature with proper spacing
  const emailWithSignature = emailContent.trim() + "\n\n" + signature;

  logger.info(`Appended signature to plain text email for donor ${options.donorId}`);
  return emailWithSignature;
}

/**
 * Removes signature pieces from structured content
 */
export function removeSignatureFromContent(structuredContent: EmailPiece[]): EmailPiece[] {
  return structuredContent.filter((piece) => !piece.references?.includes("signature"));
}
