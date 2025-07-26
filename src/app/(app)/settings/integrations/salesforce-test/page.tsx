'use client';

export default function SalesforceTestPage() {
  const testAuth = () => {
    // This will show you exactly which Salesforce instance you're being directed to
    window.open(
      'https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=test&redirect_uri=test',
      '_blank'
    );
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Salesforce Org Test</h1>
      <button onClick={testAuth} className="bg-blue-500 text-white px-4 py-2 rounded">
        Test Which Org (Check URL)
      </button>
      <p className="mt-4 text-sm text-gray-600">
        Click the button and check the URL after redirect. The domain (e.g., na139.salesforce.com)
        tells you which org instance.
      </p>
    </div>
  );
}
