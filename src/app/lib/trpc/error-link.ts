import { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { toast } from "sonner";
import type { AppRouter } from "@/app/api/trpc/routers/_app";

/**
 * Custom TRPC link that handles errors globally
 * Automatically displays toast notifications for all TRPC errors
 */
export const errorLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          // Extract error information
          const errorMessage = extractErrorMessage(err);
          const errorCode = err?.data?.code || "INTERNAL_SERVER_ERROR";

          // Show toast based on error type
          switch (errorCode) {
            case "UNAUTHORIZED":
              toast.error("Please sign in to continue");
              break;
            case "FORBIDDEN":
              toast.error(errorMessage || "You don't have permission to perform this action");
              break;
            case "NOT_FOUND":
              toast.error(errorMessage || "The requested resource was not found");
              break;
            case "CONFLICT":
              toast.error(errorMessage || "This action conflicts with existing data");
              break;
            case "BAD_REQUEST":
              toast.error(errorMessage || "Invalid request. Please check your input");
              break;
            case "INTERNAL_SERVER_ERROR":
              toast.error(errorMessage || "An unexpected error occurred. Please try again");
              break;
            default:
              toast.error(errorMessage || "An error occurred. Please try again");
          }

          // Pass the error along
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

/**
 * Extracts a human-readable error message from a TRPC error
 * @param err - The error object
 * @returns A user-friendly error message
 */
function extractErrorMessage(err: any): string {
  // Check for message in different locations where TRPC might store it
  if (err?.message) return err.message;
  if (err?.data?.message) return err.data.message;
  if (err?.shape?.message) return err.shape.message;

  // Check for Zod validation errors
  if (err?.data?.zodError) {
    const zodErrors = err.data.zodError.fieldErrors;
    const firstError = Object.values(zodErrors)[0];
    if (Array.isArray(firstError) && firstError.length > 0) {
      return firstError[0];
    }
  }

  return "An unexpected error occurred";
}
