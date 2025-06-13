"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

function StaffMicrosoftOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Use the staff Microsoft callback mutation
  const mutation = trpc.staffMicrosoft.handleStaffMicrosoftOAuthCallback.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Successfully connected Microsoft account for staff member!");
      router.push("/staff"); // Redirect to staff list page
    },
    onError: (err) => {
      console.error("Staff Microsoft callback error:", err);
      toast.error(err.message || "Failed to connect Microsoft account. Please try again.");
      router.push("/staff"); // Redirect back to staff page even on error
    },
  });

  useEffect(() => {
    if (code && state) {
      mutation.mutate({ code, state });
    } else {
      toast.error("Invalid callback from Microsoft. Missing authorization code or state.");
      router.push("/staff");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, router]);

  if (mutation.isPending) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-lg">Processing Microsoft authentication for staff member...</p>
          <div className="mt-4">
            <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-blue-600 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (mutation.isError) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-lg text-red-600">
            Error connecting Microsoft: {mutation.error?.message || "Unknown error"}. You will be redirected.
          </p>
        </div>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-lg text-green-600">Microsoft connected successfully! Redirecting...</p>
        </div>
      </div>
    );
  }

  // Fallback or initial state before useEffect runs
  return (
    <div className="container mx-auto py-6">
      <div className="text-center">
        <p className="text-lg">Waiting for Microsoft authentication...</p>
      </div>
    </div>
  );
}

export default function StaffMicrosoftOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-6">
          <p>Loading callback...</p>
        </div>
      }
    >
      <StaffMicrosoftOAuthCallbackContent />
    </Suspense>
  );
}
