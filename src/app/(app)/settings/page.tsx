"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to organization settings as the default settings page
    router.replace("/settings/organization");
  }, [router]);

  // Show loading state while redirecting
  return (
    <div className="container mx-auto px-6 py-6">
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Loading Settings...</h1>
          <p className="text-muted-foreground">Redirecting to organization settings</p>
        </div>
      </div>
    </div>
  );
}
