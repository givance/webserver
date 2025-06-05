"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

function StaffGmailOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Use the staff Gmail callback mutation
  const mutation = trpc.staffGmail.handleStaffGmailOAuthCallback.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Successfully connected Gmail account for staff member!");
      router.push("/staff"); // Redirect to staff list page
    },
    onError: (err) => {
      console.error("Staff Gmail callback error:", err);
      toast.error(err.message || "Failed to connect Gmail account. Please try again.");
      router.push("/staff"); // Redirect back to staff page even on error
    },
  });

  useEffect(() => {
    if (code && state) {
      mutation.mutate({ code, state });
    } else {
      toast.error("Invalid callback from Google. Missing authorization code or state.");
      router.push("/staff");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, router]);

  if (mutation.isPending) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-lg">Processing Gmail authentication for staff member...</p>
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
            Error connecting Gmail: {mutation.error?.message || "Unknown error"}. You will be redirected.
          </p>
        </div>
      </div>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p className="text-lg text-green-600">Gmail connected successfully! Redirecting...</p>
        </div>
      </div>
    );
  }

  // Fallback or initial state before useEffect runs
  return (
    <div className="container mx-auto py-6">
      <div className="text-center">
        <p className="text-lg">Waiting for Google authentication...</p>
      </div>
    </div>
  );
}

export default function StaffGmailOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-6">
          <p>Loading callback...</p>
        </div>
      }
    >
      <StaffGmailOAuthCallbackContent />
    </Suspense>
  );
}
