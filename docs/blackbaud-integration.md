# Blackbaud Integration Guide

## Overview

This guide explains how to set up and use the Blackbaud Sky API integration to sync donor and donation data from Blackbaud into your Givance platform.

## Prerequisites

1. **Blackbaud Sky Developer Account**: You need a developer account at https://developer.blackbaud.com/
2. **Sky API Application**: Create a new application in the Sky Developer portal
3. **API Subscription**: Subscribe to the required APIs (Constituent and Gift APIs)

## Configuration

### Environment Variables

Add these environment variables to your `.env.local` file:

```bash
# Blackbaud Integration
BLACKBAUD_CLIENT_ID=your_client_id
BLACKBAUD_CLIENT_SECRET=your_client_secret
BLACKBAUD_REDIRECT_URI=https://your-domain.com/settings/integrations/blackbaud/callback
BLACKBAUD_SUBSCRIPTION_KEY=your_subscription_key

# Enable sandbox mode for testing (optional)
BLACKBAUD_USE_SANDBOX=true
```

### Setting up Blackbaud Application

1. **Log in to Sky Developer Portal**: https://developer.blackbaud.com/

2. **Create a New Application**:
   - Go to "My applications"
   - Click "Register application"
   - Fill in application details
   - Add redirect URI: `https://your-domain.com/settings/integrations/blackbaud/callback`

3. **Subscribe to APIs**:
   - Navigate to "Products" in the developer portal
   - Subscribe to:
     - Constituent API (for donor data)
     - Gift API (for donation data)

4. **Get Your Credentials**:
   - Client ID and Secret: Found in your application settings
   - Subscription Key: Found in your profile subscriptions

## Using the Integration

### Connecting Blackbaud

1. Navigate to **Settings → Integrations** in your Givance dashboard
2. Find the Blackbaud integration card
3. Click **Connect** to start the OAuth flow
4. Authorize the application in Blackbaud
5. You'll be redirected back to Givance when complete

### Syncing Data

Once connected, you can sync data:

1. Click **Sync Now** on the Blackbaud integration card
2. The sync runs in the background and imports:
   - Constituents as Donors
   - Gifts as Donations
3. Monitor sync status on the integration card

### Data Mapping

The integration maps Blackbaud data to Givance as follows:

#### Constituents → Donors

- `id` → `externalId` (prefixed with "blackbaud\_")
- `name.first` → `firstName`
- `name.last` → `lastName`
- `email.address` → `email`
- `phone.number` → `phone`
- `address` → `address` (formatted)
- Couples are detected and mapped appropriately

#### Gifts → Donations

- `id` → `externalId` (prefixed with "blackbaud\_")
- `constituent_id` → matched to donor via externalId
- `amount.value` → `amount` (converted to cents)
- `date` → `date`
- All donations are assigned to an "External Donations" project

## Sandbox Mode

For testing, you can enable sandbox mode:

1. Set `BLACKBAUD_USE_SANDBOX=true` in your environment
2. The integration will show a "Sandbox" badge
3. Use test credentials from Blackbaud's developer cohort

### Requesting Sandbox Access

To get access to Blackbaud's sandbox environment:

1. Join the Sky Developer Community
2. Request access to the RENXT or FENXT sandbox
3. Use the sandbox for testing integrations

## Troubleshooting

### Common Issues

1. **OAuth Error**: Ensure redirect URI matches exactly in both Blackbaud and your environment

2. **401 Unauthorized**: Check that your subscription key is valid and you're subscribed to the required APIs

3. **No Data Syncing**: Verify you have the correct permissions in Blackbaud to access constituent and gift data

4. **Sync Failures**: Check the sync error message on the integration card for specific issues

### Support

For Blackbaud API issues:

- Sky Developer Community: https://community.blackbaud.com/
- API Documentation: https://developer.blackbaud.com/skyapi/

For Givance integration issues:

- Check the application logs
- Contact your system administrator

## Security Considerations

- OAuth tokens are stored encrypted at the organization level
- Only organization administrators can connect/disconnect integrations
- All API calls use HTTPS
- Tokens are automatically refreshed when expired

## Future Enhancements

The integration architecture supports adding more CRM providers:

- Salesforce
- HubSpot
- Other CRM systems

To add a new provider, implement the `ICrmProvider` interface in `/src/app/lib/services/crm/`.
