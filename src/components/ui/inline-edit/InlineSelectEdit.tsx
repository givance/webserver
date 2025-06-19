"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Edit2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface InlineSelectEditProps {
  value: string | null;
  options: SelectOption[];
  onSave: (value: string | null) => Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyText?: string;
  displayValue?: string;
}

export function InlineSelectEdit({
  value,
  options,
  onSave,
  placeholder = "Select...",
  className,
  disabled = false,
  emptyText = "Not set",
  displayValue,
}: InlineSelectEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(value);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Don't save if value hasn't changed
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const getDisplayText = () => {
    if (displayValue) return displayValue;
    if (!value) return emptyText;
    const option = options.find(opt => opt.value === value);
    return option?.label || value;
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Select
          value={editValue || undefined}
          onValueChange={(val) => setEditValue(val || null)}
          disabled={isSaving}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8 w-8 p-0"
          >
            <Save className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-gray-50",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onClick={handleStartEdit}
    >
      <span className={cn(!value && "text-muted-foreground")}>
        {getDisplayText()}
      </span>
      {!disabled && (
        <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}