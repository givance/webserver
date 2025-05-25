import { Skeleton } from "@/components/ui/skeleton";

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * Reusable loading skeleton component for data tables and lists
 * @param rows - Number of skeleton rows to display (defaults to 3)
 * @param className - Additional CSS classes
 */
export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-4 ${className || ""}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
