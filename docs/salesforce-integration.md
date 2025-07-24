# Salesforce Integration Guide

This guide walks you through setting up the Salesforce integration for syncing donor and donation data.

## Overview

The Salesforce integration allows you to:

- Sync Contacts as donors (individual donors)
- Sync Accounts as donors (households, foundations, organizations)
- Sync Opportunities as donations (closed-won opportunities only)
- Support both Production and Sandbox environments

## Prerequisites

1. **Salesforce Account**: You need access to a Salesforce org with:
   - Administrator or System Administrator profile
   - API access enabled
   - Connected App creation permissions

2. **Environment Variables**: The following environment variables must be set:
   - `SALESFORCE_CLIENT_ID` - Consumer Key from your Connected App
   - `SALESFORCE_CLIENT_SECRET` - Consumer Secret from your Connected App
   - `SALESFORCE_USE_SANDBOX` - Set to `true` for sandbox, `false` for production
   - `SALESFORCE_REDIRECT_URI` (optional) - Override the default redirect URI

## Setup Instructions

### Step 1: Create a Connected App in Salesforce

1. Log in to your Salesforce org:
   - Production: https://login.salesforce.com
   - Sandbox: https://test.salesforce.com

2. Navigate to **Setup** → **Apps** → **App Manager**

3. Click **New Connected App**

4. Fill in the following information:
   - **Connected App Name**: Givance Integration (or your preferred name)
   - **API Name**: Givance_Integration (auto-generated)
   - **Contact Email**: Your email address

5. In the **API (Enable OAuth Settings)** section:
   - Check **Enable OAuth Settings**
   - **Callback URL**:
     ```
     https://your-domain.com/settings/integrations/salesforce/callback
     ```
   - **Selected OAuth Scopes**:
     - Access and manage your data (api)
     - Perform requests on your behalf at any time (refresh_token, offline_access)

6. Click **Save**

7. After saving, you'll need to wait a few minutes for the app to be registered

### Step 2: Get Your Consumer Key and Secret

1. In the App Manager, find your newly created Connected App

2. Click the dropdown arrow and select **View**

3. Click **Manage Consumer Details** (you may need to verify your identity)

4. Copy the following values:
   - **Consumer Key** → This is your `SALESFORCE_CLIENT_ID`
   - **Consumer Secret** → This is your `SALESFORCE_CLIENT_SECRET`

### Step 3: Configure Environment Variables

Add the following to your `.env.local` file:

```bash
# Salesforce Integration
SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_USE_SANDBOX=false  # Set to true for sandbox

# Optional: Override redirect URI if needed
# SALESFORCE_REDIRECT_URI=https://your-domain.com/settings/integrations/salesforce/callback
```

### Step 4: Connect in the Application

1. Navigate to **Settings** → **Integrations** in your application

2. Find the Salesforce card and click **Connect**

3. You'll be redirected to Salesforce to authorize the connection

4. After authorization, you'll be redirected back to the application

5. Click **Sync Now** to start importing your data

## Data Mapping

### Contacts → Donors

Salesforce Contacts are mapped to individual donors with the following field mappings:

| Salesforce Field    | Givance Field      | Notes                                       |
| ------------------- | ------------------ | ------------------------------------------- |
| Id                  | externalId         | Unique identifier                           |
| FirstName           | firstName          |                                             |
| LastName            | lastName           |                                             |
| Email               | email              |                                             |
| Phone / MobilePhone | phone              | Uses Phone first, falls back to MobilePhone |
| MailingStreet       | address.street     |                                             |
| MailingCity         | address.city       |                                             |
| MailingState        | address.state      |                                             |
| MailingPostalCode   | address.postalCode |                                             |
| MailingCountry      | address.country    |                                             |

Additional metadata stored: AccountId, Title, Department, CreatedDate, LastModifiedDate

### Accounts → Donors

Salesforce Accounts (of type Household, Individual, or Foundation) are mapped to donors:

| Salesforce Field  | Givance Field           | Notes                                       |
| ----------------- | ----------------------- | ------------------------------------------- |
| Id                | externalId              | Unique identifier                           |
| Name              | firstName / displayName | Full name in firstName, also in displayName |
| Phone             | phone                   |                                             |
| BillingStreet     | address.street          |                                             |
| BillingCity       | address.city            |                                             |
| BillingState      | address.state           |                                             |
| BillingPostalCode | address.postalCode      |                                             |
| BillingCountry    | address.country         |                                             |

The integration attempts to parse household names (e.g., "John and Jane Smith Household") to identify couples.

### Opportunities → Donations

Only closed-won Opportunities are synced as donations:

| Salesforce Field      | Givance Field   | Notes                                |
| --------------------- | --------------- | ------------------------------------ |
| Id                    | externalId      | Unique identifier                    |
| ContactId / AccountId | donorExternalId | Links to donor record                |
| Amount                | amount          | Converted to cents                   |
| CloseDate             | date            |                                      |
| Name                  | designation     | Opportunity name used as designation |

Additional metadata stored: AccountId, ContactId, StageName, Type, CampaignId, Probability

## Sync Behavior

- **Initial Sync**: Imports all Contacts, qualifying Accounts, and closed-won Opportunities
- **Incremental Sync**: Updates existing records and adds new ones
- **Duplicate Prevention**: Uses Salesforce IDs as external IDs to prevent duplicates
- **Error Handling**: Failed records are logged but don't stop the sync process
- **Background Processing**: Sync runs as a background job to handle large datasets

## Troubleshooting

### Common Issues

1. **"Missing required Salesforce environment variables"**
   - Ensure both `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET` are set
   - Check for typos in the environment variable names

2. **"Failed to exchange authorization code"**
   - Verify the redirect URI matches exactly between your app and Connected App
   - Ensure the Connected App is active (may take a few minutes after creation)
   - Check that OAuth scopes include both `api` and `refresh_token`

3. **"No donors/donations imported"**
   - Verify API access is enabled for your user profile
   - Check that you have Contacts/Opportunities in your Salesforce org
   - For sandbox, ensure `SALESFORCE_USE_SANDBOX=true` is set

4. **Token Expiration**
   - The integration automatically refreshes tokens when they expire
   - If refresh fails, you'll need to reconnect the integration

### Debug Mode

Visit `/settings/integrations/salesforce-debug` to:

- View current configuration status
- Check environment variable settings
- See detailed setup instructions
- Verify sandbox/production mode

## Security Considerations

1. **API Access**: Only grant API access to trusted users
2. **Token Storage**: Access and refresh tokens are stored encrypted in the database
3. **Scope Limitation**: Only request necessary OAuth scopes
4. **Instance URL**: The Salesforce instance URL is stored securely to make API calls

## API Rate Limits

Salesforce enforces API rate limits:

- **Daily API Requests**: Varies by edition (15,000 - 5,000,000)
- **Concurrent Request Limit**: 25 long-running requests

The integration uses pagination and respects these limits during sync operations.
