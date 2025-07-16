import { env } from '@/app/lib/env';
import { FeatureFlagService } from './service';
import { FeatureFlags } from './types';

/**
 * Checks if a feature is enabled for an organization
 * This function checks both environment variables and organization-specific feature flags
 *
 * @param organizationId - The organization ID
 * @param featureName - The name of the feature flag to check
 * @returns Promise<boolean> - Whether the feature is enabled
 */
export async function isFeatureEnabledForOrganization(
  organizationId: string,
  featureName: keyof FeatureFlags
): Promise<boolean> {
  // First check environment variables for global overrides
  // This allows us to enable features globally via environment variables
  if (featureName === 'use_agentic_flow' && env.USE_AGENTIC_FLOW === true) {
    return true;
  }

  // If no global override, check organization-specific feature flags
  return await FeatureFlagService.isFeatureEnabled(organizationId, featureName);
}

/**
 * Gets all feature flags for an organization, considering environment overrides
 *
 * @param organizationId - The organization ID
 * @returns Promise<FeatureFlags> - The effective feature flags
 */
export async function getEffectiveFeatureFlags(organizationId: string): Promise<FeatureFlags> {
  const featureFlagManager = await FeatureFlagService.getFeatureFlags(organizationId);
  const orgFlags = featureFlagManager.getAllFlags();

  // Apply environment variable overrides
  const effectiveFlags: FeatureFlags = {
    ...orgFlags,
    // Environment variables override organization settings
    use_agentic_flow: env.USE_AGENTIC_FLOW === true ? true : orgFlags.use_agentic_flow,
  };

  return effectiveFlags;
}
