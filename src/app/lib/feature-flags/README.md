# Feature Flags Implementation

This directory contains the feature flag system for the Givance platform, allowing organization-specific feature toggling.

## Overview

The feature flag system provides:
- Organization-specific feature toggles stored in the database
- Environment variable overrides for global feature control
- Type-safe feature flag management
- Easy integration with both backend services and frontend components

## Available Feature Flags

### `use_agentic_flow`
Controls the agentic email generation flow that provides iterative conversation capabilities.
- **Default**: `false`
- **Environment Override**: `USE_AGENTIC_FLOW=true`

### `use_o3_model`
Enables the use of Azure OpenAI's O3 model deployment for enhanced AI capabilities.
- **Default**: `false`
- **Environment Override**: None (organization-specific only)

## Backend Usage

### In Services

```typescript
import { isFeatureEnabledForOrganization } from '@/app/lib/feature-flags/utils';

// Check if a feature is enabled
const useAgenticFlow = await isFeatureEnabledForOrganization(organizationId, 'use_agentic_flow');

if (useAgenticFlow) {
  // Feature-specific logic
}
```

### In tRPC Routers

```typescript
// Get feature flags for the current organization
const featureFlagManager = await ctx.services.organizations.getOrganizationFeatureFlags(
  ctx.auth.user.organizationId
);

const flags = featureFlagManager.getAllFlags();
```

### Getting Organization with Feature Flags

```typescript
// Use the enhanced method that includes feature flags
const org = await ctx.services.organizations.getOrganizationWithFeatureFlags(organizationId);
// org.featureFlags will contain the current flags
```

## Frontend Usage

### Using the Hook

```typescript
import { useFeatureFlags } from '@/app/hooks/use-feature-flags';

function MyComponent() {
  const { useAgenticFlow, useO3Model, isFeatureEnabled } = useFeatureFlags();

  if (useAgenticFlow) {
    // Render agentic flow UI
  }

  // Or check any flag dynamically
  if (isFeatureEnabled('use_o3_model')) {
    // Use O3 model features
  }
}
```

### Using the Component

```tsx
import { FeatureFlag } from '@/app/hooks/use-feature-flags';

function MyComponent() {
  return (
    <FeatureFlag flag="use_agentic_flow">
      <AgenticFlowComponent />
    </FeatureFlag>
  );
}

// With fallback
<FeatureFlag flag="use_o3_model" fallback={<StandardModel />}>
  <O3ModelComponent />
</FeatureFlag>
```

## API Endpoints

### Get Current Organization (includes feature flags)
```typescript
const org = await trpc.organizations.getCurrent.query();
// org.featureFlags contains the flags
```

### Get Feature Flags Only
```typescript
const flags = await trpc.organizations.getFeatureFlags.query();
// Returns: { use_agentic_flow: boolean, use_o3_model: boolean }
```

## Database Schema

Feature flags are stored in the `organizations` table as a JSONB column:

```sql
feature_flags JSONB DEFAULT '{"use_o3_model": false, "use_agentic_flow": false}'::jsonb
```

## Environment Variable Overrides

The system supports environment variable overrides that take precedence over database values:

- `USE_AGENTIC_FLOW=true` - Enables agentic flow for all organizations

This allows for:
1. Global feature rollouts via environment variables
2. Testing features in specific environments
3. Emergency feature toggles without database changes

## Adding New Feature Flags

1. Add the flag to `FeatureFlags` interface in `types.ts`
2. Update `DEFAULT_FEATURE_FLAGS` in `types.ts`
3. Update the database schema default in `organizations.ts`
4. Add environment override logic in `utils.ts` if needed
5. Run migrations to update existing organizations

## Best Practices

1. **Always check feature flags asynchronously** - They require database access
2. **Cache feature flags on the frontend** - Use the built-in caching in the hook
3. **Provide fallbacks** - Always handle the case where a feature is disabled
4. **Use environment overrides sparingly** - Prefer organization-specific settings
5. **Document feature behavior** - Clearly explain what each flag controls

## Testing

When testing feature-flagged code:

```typescript
// Mock the feature flag service
jest.mock('@/app/lib/feature-flags/service');

// Set up specific flag states
const mockFeatureFlagManager = new FeatureFlagManager({
  use_agentic_flow: true,
  use_o3_model: false,
});
(FeatureFlagService.getFeatureFlags as jest.Mock).mockResolvedValue(mockFeatureFlagManager);
```