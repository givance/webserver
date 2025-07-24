'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { trpc } from '@/app/lib/trpc/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const provider = params.provider as string;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const handleCallbackMutation = trpc.integrations.handleIntegrationCallback.useMutation({
    onSuccess: () => {
      toast.success(`${provider} integration connected successfully`);
      router.push('/settings/integrations');
    },
    onError: (error) => {
      setError(error.message || 'Failed to connect integration');
      setIsProcessing(false);
      toast.error(error.message || 'Failed to connect integration');
    },
  });

  useEffect(() => {
    if (errorParam) {
      setError(errorDescription || 'Authorization failed');
      setIsProcessing(false);
      toast.error(errorDescription || 'Authorization failed');
      return;
    }

    if (!code || !state || !provider) {
      setError('Missing required parameters');
      setIsProcessing(false);
      return;
    }

    // Handle the OAuth callback
    handleCallbackMutation.mutate({
      provider,
      code,
      state,
    });
  }, [code, state, provider, errorParam, errorDescription, handleCallbackMutation]);

  return (
    <>
      <title>Connecting {provider} - Integrations</title>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {isProcessing ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Connecting {provider}...</h2>
              <p className="text-muted-foreground">Please wait while we complete the connection.</p>
            </>
          ) : error ? (
            <>
              <h2 className="text-xl font-semibold mb-2 text-destructive">Connection Failed</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => router.push('/settings/integrations')}
                className="text-primary hover:underline"
              >
                Return to integrations
              </button>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
