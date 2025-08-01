# CRM Integration Migration Guide

## Overview

CRM integrations have been moved from the organization level to the staff level. This change allows different staff members to have their own CRM connections with appropriate access levels and permissions.

## What Changed

### Database Changes

- **Removed**: `organization_integrations` table (organization-level CRM connections)
- **Added**: `staff_integrations` table (staff-level CRM connections)

### UI Changes

- CRM integrations are now managed in the Staff detail page under the "CRM Integration" tab
- The organization-level integrations page now shows a notice directing users to staff profiles

### API Changes

- All CRM integration endpoints now require a `staffId` parameter
- Integration operations are scoped to individual staff members

## Migration Steps

### For Existing Integrations

If you have existing organization-level CRM integrations, you'll need to:

1. **Identify the primary staff member** who should own the CRM connection
2. **Re-authenticate** the CRM connection through that staff member's profile
3. **Run a sync** to ensure all data is properly connected

### Setting Up New Integrations

1. Navigate to **Staff** in the main menu
2. Click on the staff member who needs CRM access
3. Go to the **CRM Integration** tab
4. Click **Connect** for the desired CRM (Salesforce or Blackbaud)
5. Complete the OAuth flow
6. Run an initial sync

## Benefits of Staff-Level Integration

- **Granular Permissions**: Each staff member can have their own access level
- **Audit Trail**: Track which staff member performed CRM operations
- **Flexibility**: Different staff can connect to different CRM instances
- **Security**: Limit CRM access to specific team members

## API Reference

### Updated Endpoints

```typescript
// Get staff integrations
GET /api/trpc/integrations.getStaffIntegrations
Query params: { staffId?: number }

// Connect integration
POST /api/trpc/integrations.getIntegrationAuthUrl
Body: { provider: string, staffId: number }

// Sync data
POST /api/trpc/integrations.syncIntegrationData
Body: { integrationId: number, usePerDonorGiftTransactions?: boolean }

// Disconnect integration
POST /api/trpc/integrations.disconnectIntegration
Body: { integrationId: number }
```

## Troubleshooting

### "Staff ID is required" Error

Make sure you're accessing CRM integrations through a staff member's profile, not the organization settings.

### Lost Integration After Migration

Organization-level integrations need to be re-established at the staff level. This is a one-time process.

### Multiple Staff Need Access

Each staff member can have their own CRM connection. Simply repeat the connection process for each staff member.
