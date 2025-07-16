/**
 * Feature flags configuration for organizations
 */
export interface FeatureFlags {
  use_o3_model: boolean;
  use_agentic_flow: boolean;
}

/**
 * Default feature flag values
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  use_o3_model: false,
  use_agentic_flow: false,
};

/**
 * Feature flag manager class for handling default values and merging
 */
export class FeatureFlagManager {
  private flags: FeatureFlags;

  constructor(dbFlags: Partial<FeatureFlags> | null | undefined) {
    // Merge database flags with defaults, database values take precedence
    this.flags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...(dbFlags || {}),
    };
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Get a specific feature flag value
   */
  getFlag<K extends keyof FeatureFlags>(flagName: K): FeatureFlags[K] {
    return this.flags[flagName];
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(flagName: keyof FeatureFlags): boolean {
    return this.flags[flagName] === true;
  }

  /**
   * Get flags for database storage
   */
  toJSON(): FeatureFlags {
    return this.getAllFlags();
  }

  /**
   * Create a FeatureFlagManager from database JSON
   */
  static fromJSON(json: unknown): FeatureFlagManager {
    if (typeof json === 'object' && json !== null) {
      return new FeatureFlagManager(json as Partial<FeatureFlags>);
    }
    return new FeatureFlagManager(null);
  }
}
