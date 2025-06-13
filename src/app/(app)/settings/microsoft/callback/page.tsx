"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

function MicrosoftOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Or handle as needed if you set a state param

  // Let tRPC infer the types for useMutation
  const mutation = trpc.microsoft.handleOAuthCallback.useMutation({
    onSuccess: (data) => {
      // data type will be inferred
      toast.success(data.message || "Successfully connected Microsoft account!");
      router.push("/settings"); // Redirect to Microsoft settings page or dashboard
    },
    onError: (err) => {
      // err type will be inferred
      console.error("Callback error:", err);
      toast.error(err.message || "Failed to connect Microsoft account. Please try again.");
      router.push("/settings"); // Redirect back even on error
    },
  });

  useEffect(() => {
    if (code) {
      mutation.mutate({ code, state: state || undefined });
    } else {
      toast.error("Invalid callback from Microsoft. Missing authorization code.");
      router.push("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, router]); // mutation.mutate is stable, no need to add to deps

  if (mutation.isPending) {
    return <p>Processing Microsoft authentication...</p>;
  }

  if (mutation.isError) {
    // Error is handled by onError and toast, this is a fallback or for more detailed UI
    return <p>Error connecting Microsoft: {mutation.error?.message || "Unknown error"}. You will be redirected.</p>;
  }

  if (mutation.isSuccess) {
    return <p>Microsoft connected successfully! Redirecting...</p>;
  }

  // Fallback or initial state before useEffect runs
  return <p>Waiting for Microsoft authentication...</p>;
}

export default function MicrosoftOAuthCallbackPage() {
  return (
    <Suspense fallback={<p>Loading callback...</p>}>
      <MicrosoftOAuthCallbackContent />
    </Suspense>
  );
}
