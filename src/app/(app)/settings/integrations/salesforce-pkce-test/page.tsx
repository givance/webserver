'use client';

import { useState } from 'react';
import { trpc } from '@/app/lib/trpc/client';

export default function SalesforcePKCETestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const getAuthUrl = trpc.integrations.getIntegrationAuthUrl.useMutation();

  const testPKCE = async () => {
    setLogs(['Starting PKCE test...']);

    try {
      // Get the auth URL which should store PKCE
      setLogs((prev) => [...prev, 'Calling getIntegrationAuthUrl...']);
      const result = await getAuthUrl.mutateAsync({
        provider: 'salesforce',
      });

      setLogs((prev) => [...prev, `Got auth URL: ${result.authUrl.substring(0, 100)}...`]);

      // Extract the state from the URL
      const url = new URL(result.authUrl);
      const state = url.searchParams.get('state');

      if (state) {
        setLogs((prev) => [...prev, `State from URL: ${state.substring(0, 50)}...`]);

        // Now check if we can retrieve the PKCE verifier
        const response = await fetch('/api/test-pkce-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        });

        const data = await response.json();
        setLogs((prev) => [...prev, `PKCE lookup result: ${JSON.stringify(data)}`]);
      }
    } catch (error) {
      setLogs((prev) => [...prev, `Error: ${error}`]);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Salesforce PKCE Test</h1>

      <button onClick={testPKCE} className="bg-blue-500 text-white px-4 py-2 rounded mb-4">
        Test PKCE Storage & Retrieval
      </button>

      <div className="bg-gray-100 p-4 rounded">
        <h2 className="font-bold mb-2">Logs:</h2>
        <pre className="text-sm whitespace-pre-wrap">{logs.join('\n')}</pre>
      </div>
    </div>
  );
}
