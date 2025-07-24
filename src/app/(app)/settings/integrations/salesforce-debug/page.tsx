'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { trpc } from '@/app/lib/trpc/client';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SalesforceDebugPage() {
  const router = useRouter();
  const { data: config, isLoading } = trpc.integrations.debugSalesforceConfig.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-6">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <>
      <title>Salesforce Configuration Debug</title>
      <div className="container mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Salesforce Configuration Debug</h1>
          <p className="text-muted-foreground">
            This page helps you verify your Salesforce integration configuration.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Configuration Status</CardTitle>
            <CardDescription>Current Salesforce OAuth application settings</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant={config?.configured ? 'default' : 'destructive'}>
              <AlertTitle className="flex items-center gap-2">
                {config?.configured ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Configuration Complete
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Configuration Incomplete
                  </>
                )}
              </AlertTitle>
              <AlertDescription>{config?.message}</AlertDescription>
            </Alert>

            <div className="mt-4 space-y-2">
              <h3 className="font-semibold">Environment Variables:</h3>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {config?.details.hasClientId ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-mono">SALESFORCE_CLIENT_ID</span>
                  {config?.details.hasClientId && (
                    <span className="text-muted-foreground">
                      ({config.details.clientIdLength} chars, starts with{' '}
                      {config.details.clientIdPrefix})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {config?.details.hasClientSecret ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-mono">SALESFORCE_CLIENT_SECRET</span>
                  {config?.details.hasClientSecret && (
                    <span className="text-muted-foreground">
                      ({config.details.clientSecretLength} chars)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="font-mono">SALESFORCE_USE_SANDBOX</span>
                  <span className="text-muted-foreground">
                    {config?.details.isSandbox ? 'true (Sandbox mode)' : 'false (Production mode)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="font-semibold">OAuth Redirect URI:</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-mono bg-muted px-1 py-0.5 rounded">
                    {config?.details.expectedRedirectUri}
                  </span>
                </p>
                {config?.details.envRedirectUri !== 'Not set' && (
                  <p className="text-muted-foreground">
                    Environment override:{' '}
                    <span className="font-mono">{config?.details.envRedirectUri}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
            <CardDescription>
              Follow these steps to configure Salesforce integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Create a Connected App in Salesforce</h3>
              <ol className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>
                  Log in to your Salesforce org (
                  {config?.details.isSandbox ? 'Sandbox' : 'Production'})
                </li>
                <li>Navigate to Setup → Apps → App Manager</li>
                <li>Click &quot;New Connected App&quot;</li>
                <li>Fill in the basic information</li>
                <li>Enable OAuth Settings</li>
                <li>
                  Set the Callback URL to:{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    {config?.details.expectedRedirectUri}
                  </code>
                </li>
                <li>
                  Select OAuth Scopes:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Access and manage your data (api)</li>
                    <li>
                      Perform requests on your behalf at any time (refresh_token, offline_access)
                    </li>
                  </ul>
                </li>
                <li>Save the Connected App</li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Get your Consumer Key and Secret</h3>
              <ol className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>After saving, click &quot;Manage Consumer Details&quot;</li>
                <li>Copy the Consumer Key → Set as SALESFORCE_CLIENT_ID</li>
                <li>Copy the Consumer Secret → Set as SALESFORCE_CLIENT_SECRET</li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold mb-2">3. Environment Setup</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Add these to your .env.local file:
              </p>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                {`SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_USE_SANDBOX=${config?.details.isSandbox ? 'true' : 'false'}
# Optional: Override redirect URI if needed
# SALESFORCE_REDIRECT_URI=${config?.details.expectedRedirectUri}`}
              </pre>
            </div>

            <div className="pt-4 border-t">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Important Notes</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>
                      {config?.details.isSandbox
                        ? 'You are using SANDBOX mode - ensure you use a sandbox org'
                        : 'You are using PRODUCTION mode - ensure you use a production org'}
                    </li>
                    <li>The Consumer Key and Secret are sensitive - keep them secure</li>
                    <li>You may need to wait a few minutes after creating the Connected App</li>
                    <li>Ensure your user has API access permissions</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Button onClick={() => router.push('/settings/integrations')}>
            Back to Integrations
          </Button>
        </div>
      </div>
    </>
  );
}
