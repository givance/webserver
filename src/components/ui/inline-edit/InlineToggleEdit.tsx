"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface InlineToggleEditProps {
  value: boolean;
  onSave: (value: boolean) => Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
  trueText?: string;
  falseText?: string;
}

export function InlineToggleEdit({
  value,
  onSave,
  label,
  className,
  disabled = false,
  trueText = "Yes",
  falseText = "No",
}: InlineToggleEditProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (disabled || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(checked);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Switch
        checked={value}
        onCheckedChange={handleToggle}
        disabled={disabled || isSaving}
      />
      {label && <span className="text-sm">{label}</span>}
      <span className={cn("text-sm", value ? "text-green-600" : "text-gray-500")}>
        {value ? trueText : falseText}
      </span>
    </div>
  );
}