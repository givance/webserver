import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function Container({ children, className, size = "lg" }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto px-4 sm:px-6 w-full",
        {
          "max-w-3xl": size === "sm",
          "max-w-4xl": size === "md",
          "max-w-5xl": size === "lg",
          "max-w-6xl": size === "xl",
          "max-w-none": size === "full",
        },
        className
      )}
    >
      {children}
    </div>
  );
}
