import crypto from 'crypto';
import { logger } from '@/app/lib/logger';
import { db } from '@/app/lib/db';
import { oauthPkceVerifiers } from '@/app/lib/db/schema';
import { eq, lt } from 'drizzle-orm';

/**
 * Generate PKCE code verifier and challenge for OAuth 2.0 flows
 */
export function generatePKCEPair() {
  // Generate a cryptographically random code verifier (43-128 characters)
  const verifier = crypto.randomBytes(64).toString('base64url');

  // Generate the code challenge using SHA256
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  return {
    codeVerifier: verifier,
    codeChallenge: challenge,
  };
}

/**
 * Store PKCE verifier in database for persistence across requests
 */
export async function storePKCEVerifier(state: string, verifier: string) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    logger.info('Attempting to store PKCE verifier', {
      state: state.substring(0, 20) + '...',
      stateLength: state.length,
      verifierLength: verifier.length,
      expiresAt: expiresAt.toISOString(),
    });

    // Use upsert to handle potential conflicts
    const result = await db
      .insert(oauthPkceVerifiers)
      .values({
        state,
        verifier,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: oauthPkceVerifiers.state,
        set: {
          verifier,
          expiresAt,
        },
      });

    logger.info('PKCE verifier stored in database successfully', {
      state: state.substring(0, 20) + '...',
      expiresAt: expiresAt.toISOString(),
      result: result.rowCount,
    });

    // Clean up expired entries
    await cleanupExpiredVerifiers();
  } catch (error) {
    logger.error('Failed to store PKCE verifier - full error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      state: state.substring(0, 20) + '...',
    });
    throw error;
  }
}

export async function getPKCEVerifier(state: string): Promise<string | undefined> {
  try {
    const result = await db.query.oauthPkceVerifiers.findFirst({
      where: eq(oauthPkceVerifiers.state, state),
    });

    if (!result) {
      logger.warn('PKCE verifier not found in database', {
        state: state.substring(0, 20) + '...',
      });
      return undefined;
    }

    if (result.expiresAt < new Date()) {
      logger.warn('PKCE verifier expired', {
        state: state.substring(0, 20) + '...',
        expiredAt: result.expiresAt.toISOString(),
      });
      // Delete expired entry
      await db.delete(oauthPkceVerifiers).where(eq(oauthPkceVerifiers.state, state));
      return undefined;
    }

    logger.info('PKCE verifier found in database', {
      state: state.substring(0, 20) + '...',
      expiresAt: result.expiresAt.toISOString(),
    });
    return result.verifier;
  } catch (error) {
    logger.error('Failed to get PKCE verifier', { error, state: state.substring(0, 20) + '...' });
    return undefined;
  }
}

export async function deletePKCEVerifier(state: string) {
  try {
    const result = await db.delete(oauthPkceVerifiers).where(eq(oauthPkceVerifiers.state, state));
    logger.info('PKCE verifier deleted from database', {
      state: state.substring(0, 20) + '...',
    });
  } catch (error) {
    logger.error('Failed to delete PKCE verifier', {
      error,
      state: state.substring(0, 20) + '...',
    });
  }
}

/**
 * Clean up expired verifiers from database
 */
async function cleanupExpiredVerifiers() {
  try {
    const result = await db
      .delete(oauthPkceVerifiers)
      .where(lt(oauthPkceVerifiers.expiresAt, new Date()));

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Cleaned up expired PKCE verifiers', { count: result.rowCount });
    }
  } catch (error) {
    logger.error('Failed to clean up expired PKCE verifiers', { error });
  }
}
