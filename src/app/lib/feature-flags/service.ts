import { eq } from 'drizzle-orm';
import { db } from '../db';
import { organizations } from '../db/schema';
import { FeatureFlagManager, FeatureFlags } from './types';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';

export class FeatureFlagService {
  /**
   * Get feature flags for an organization
   */
  static async getFeatureFlags(organizationId: string): Promise<FeatureFlagManager> {
    const org = await wrapDatabaseOperation(
      () =>
        db
          .select({ featureFlags: organizations.featureFlags })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1),
      { operation: 'FeatureFlagService.getFeatureFlags', organizationId }
    );

    if (org.length === 0) {
      // Organization not found, return default flags
      return new FeatureFlagManager(null);
    }

    return FeatureFlagManager.fromJSON(org[0].featureFlags);
  }

  /**
   * Update feature flags for an organization
   */
  static async updateFeatureFlags(
    organizationId: string,
    flags: Partial<FeatureFlags>
  ): Promise<FeatureFlagManager> {
    // Get current flags
    const currentFlags = await this.getFeatureFlags(organizationId);
    const allFlags = currentFlags.getAllFlags();

    // Merge with new flags
    const updatedFlags = {
      ...allFlags,
      ...flags,
    };

    // Update in database
    await wrapDatabaseOperation(
      () =>
        db
          .update(organizations)
          .set({ featureFlags: updatedFlags })
          .where(eq(organizations.id, organizationId)),
      { operation: 'FeatureFlagService.updateFeatureFlags', organizationId }
    );

    return new FeatureFlagManager(updatedFlags);
  }

  /**
   * Check if a specific feature is enabled for an organization
   */
  static async isFeatureEnabled(
    organizationId: string,
    flagName: keyof FeatureFlags
  ): Promise<boolean> {
    const flags = await this.getFeatureFlags(organizationId);
    return flags.isEnabled(flagName);
  }

  /**
   * Reset feature flags to defaults for an organization
   */
  static async resetFeatureFlags(organizationId: string): Promise<FeatureFlagManager> {
    const defaultManager = new FeatureFlagManager(null);
    const defaultFlags = defaultManager.getAllFlags();

    await wrapDatabaseOperation(
      () =>
        db
          .update(organizations)
          .set({ featureFlags: defaultFlags })
          .where(eq(organizations.id, organizationId)),
      { operation: 'FeatureFlagService.resetFeatureFlags', organizationId }
    );

    return defaultManager;
  }
}
