'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/app/lib/trpc/client';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function BlackbaudDebugPage() {
  const router = useRouter();
  const { data, isLoading, error } = trpc.integrations.debugBlackbaudConfig.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading configuration...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-6 py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load configuration: {error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const details = data?.details;

  return (
    <>
      <title>Blackbaud Debug - Settings</title>
      <div className="container mx-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Blackbaud Configuration Debug</CardTitle>
            <CardDescription>
              Environment variable configuration status for Blackbaud integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={data?.configured ? 'default' : 'destructive'}>
              <div className="flex items-center gap-2">
                {data?.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>{data?.message}</AlertDescription>
              </div>
            </Alert>

            <div className="space-y-3">
              <h3 className="font-medium">Configuration Details:</h3>

              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {details?.hasClientId ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">Client ID:</span>
                  <span className="text-muted-foreground">
                    {details?.hasClientId
                      ? `${details.clientIdPrefix} (${details.clientIdLength} chars)`
                      : 'Not configured'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {details?.hasClientSecret ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">Client Secret:</span>
                  <span className="text-muted-foreground">
                    {details?.hasClientSecret
                      ? `Configured (${details.clientSecretLength} chars)`
                      : 'Not configured'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {details?.hasSubscriptionKey ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">Subscription Key:</span>
                  <span className="text-muted-foreground">
                    {details?.hasSubscriptionKey
                      ? `${details.subscriptionKeyPrefix} (${details.subscriptionKeyLength} chars)`
                      : 'Not configured'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium">Sandbox Mode:</span>
                  <span className="text-muted-foreground">
                    {details?.isSandbox ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium">Base URL:</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {details?.baseUrl}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium">Expected Redirect URI:</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {details?.expectedRedirectUri}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium">Env Redirect URI:</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {details?.envRedirectUri}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-2">Important Notes:</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Make sure to restart your dev server after adding environment variables</li>
                <li>The redirect URI must match exactly in your Blackbaud app settings</li>
                <li>Using ngrok? Update the redirect URI in Blackbaud to match your ngrok URL</li>
                <li>
                  Your .env file should have BLACKBAUD_REDIRECT_URI set to:{' '}
                  <code className="font-mono bg-muted px-1">{details?.expectedRedirectUri}</code>
                </li>
              </ul>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => router.push('/settings/integrations')}>
                Back to Integrations
              </Button>
              <Button onClick={() => window.location.reload()}>Refresh</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
