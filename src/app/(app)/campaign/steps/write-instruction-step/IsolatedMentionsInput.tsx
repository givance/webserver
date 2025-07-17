'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mention, MentionsInput } from 'react-mentions';
import { IsolatedInputProps } from './types';

export function IsolatedMentionsInput({
  initialValue,
  placeholder,
  projectMentions,
  onSubmit,
  onValueChange,
  isGenerating,
  onKeyDown,
}: IsolatedInputProps) {
  const [localValue, setLocalValue] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const [internalKey, setInternalKey] = useState(0);

  // Track previous initialValue to detect changes
  const prevInitialValueRef = useRef(initialValue);

  // Update local value when initial value changes (from external sources)
  useEffect(() => {
    if (prevInitialValueRef.current !== initialValue) {
      // Always sync when initialValue changes
      setLocalValue(initialValue);
      valueRef.current = initialValue;

      // Force re-render of MentionsInput when clearing
      if (initialValue === '') {
        setInternalKey((prev) => prev + 1);
      }

      prevInitialValueRef.current = initialValue;
    }
  }, [initialValue]); // Only depend on initialValue

  const handleChange = useCallback(
    (event: any, newValue: string) => {
      setLocalValue(newValue);
      valueRef.current = newValue;
      // Notify parent component of value change
      onValueChange?.(newValue);
    },
    [onValueChange]
  );

  const handleSubmit = useCallback(() => {
    if (valueRef.current.trim()) {
      onSubmit(valueRef.current);
      // Don't clear here - let the parent handle clearing after successful generation
    }
  }, [onSubmit]);

  const handleKeyDownInternal = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isGenerating && valueRef.current.trim()) {
          handleSubmit();
        }
      }
      onKeyDown?.(event);
    },
    [handleSubmit, isGenerating, onKeyDown]
  );

  const mentionsInputStyle = useMemo(() => ({ fontSize: '13px' }), []);

  return (
    <div className="max-h-[120px] overflow-y-auto p-4 pb-2">
      <MentionsInput
        key={internalKey}
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="mentions-input"
        onKeyDown={handleKeyDownInternal}
        style={mentionsInputStyle}
      >
        <Mention
          trigger="@"
          data={projectMentions}
          markup="@[__display__](__id__)"
          displayTransform={(id, display) => `@${display}`}
          appendSpaceOnAdd={true}
        />
      </MentionsInput>
    </div>
  );
}
