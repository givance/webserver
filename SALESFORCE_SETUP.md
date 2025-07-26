# Salesforce OAuth Setup Guide

## Environment Configuration

### For Local Development

```bash
SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_REDIRECT_URI=http://localhost:3000/settings/integrations/salesforce/callback
BASE_URL=http://localhost:3000
```

### For Production (app.givance.ai)

```bash
SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_REDIRECT_URI=https://app.givance.ai/settings/integrations/salesforce/callback
BASE_URL=https://app.givance.ai
```

## Salesforce Connected App Configuration

1. In Salesforce Setup, go to **Apps** → **App Manager**
2. Click **New Connected App**
3. Configure with these settings:

### Basic Information

- **Connected App Name**: Givance Integration
- **Contact Email**: Your email

### OAuth Settings

- **Enable OAuth Settings**: ✓ Checked
- **Callback URL**:
  - For development: `http://localhost:3000/settings/integrations/salesforce/callback`
  - For production: `https://app.givance.ai/settings/integrations/salesforce/callback`
  - You can add multiple URLs for different environments
- **Selected OAuth Scopes**:
  - Access and manage your data (api)
  - Perform requests on your behalf at any time (refresh_token, offline_access)
  - Provide access to your data via the Web (web)
  - Access your basic information (id, profile, email, address, phone)

### Save and Note

After saving, note down:

- **Consumer Key** (use as SALESFORCE_CLIENT_ID)
- **Consumer Secret** (use as SALESFORCE_CLIENT_SECRET)

## Important Notes

1. **PKCE Support**: The integration now includes PKCE (Proof Key for Code Exchange) for enhanced security, which is required by Salesforce OAuth 2.0 flows.

2. **Multiple Redirect URIs**: You can add both local and production callback URLs in the same Connected App to support multiple environments.

3. **Sandbox vs Production**:
   - For Salesforce sandbox, update these environment variables:

   ```bash
   SALESFORCE_AUTH_URL=https://test.salesforce.com/services/oauth2/authorize
   SALESFORCE_TOKEN_URL=https://test.salesforce.com/services/oauth2/token
   ```

4. **Testing the Integration**:
   - Navigate to Settings → Integrations in your Givance app
   - Click "Connect Salesforce"
   - You'll be redirected to Salesforce to authorize
   - After authorization, you'll be redirected back and the integration will be connected

## Troubleshooting

If you see "missing required code challenge" error:

- The PKCE implementation has been added to fix this
- Clear your browser cache and try again
- Ensure you're using the latest code

If redirect fails:

- Verify the callback URL in Salesforce matches exactly (including protocol)
- Check that BASE_URL environment variable is set correctly
- Ensure your Salesforce Connected App is activated
