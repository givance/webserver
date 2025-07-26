'use client';

import { useEffect, useState } from 'react';

export default function SalesforceDebugEnvPage() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    // Fetch the current configuration from the API
    fetch(
      '/api/trpc/integrations.getIntegrationDebugInfo?input=' +
        encodeURIComponent(
          JSON.stringify({
            provider: 'salesforce',
          })
        )
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.result?.data) {
          setConfig(data.result.data);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Salesforce Configuration Debug</h1>

      <div className="bg-gray-100 p-4 rounded mb-6">
        <h2 className="font-bold mb-2">Current Client ID Being Used:</h2>
        <code className="block bg-white p-2 rounded break-all">
          {config?.details?.clientId || 'Loading...'}
        </code>
      </div>

      <div className="bg-yellow-100 p-4 rounded mb-6">
        <h2 className="font-bold mb-2">⚠️ Check This:</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>Log into Salesforce</li>
          <li>Go to Setup → Apps → App Manager</li>
          <li>Find your Connected App and click View</li>
          <li>Copy the Consumer Key</li>
          <li>Make sure it matches the Client ID above</li>
        </ol>
      </div>

      {config && (
        <div className="bg-blue-100 p-4 rounded">
          <h2 className="font-bold mb-2">Full Configuration:</h2>
          <pre className="bg-white p-2 rounded overflow-x-auto text-sm">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
