import { AlertCircle } from "lucide-react";

interface ErrorDisplayProps {
  error: Error | string;
  title?: string;
  className?: string;
}

/**
 * Reusable error display component
 * @param error - Error object or error message string
 * @param title - Optional title for the error (defaults to "Error")
 * @param className - Additional CSS classes
 */
export function ErrorDisplay({ error, title = "Error", className }: ErrorDisplayProps) {
  const errorMessage = typeof error === "string" ? error : error.message;

  return (
    <div className={`container mx-auto py-6 ${className || ""}`}>
      <div className="flex items-center gap-2 text-red-500">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium">{title}:</span>
        <span>{errorMessage}</span>
      </div>
    </div>
  );
}
