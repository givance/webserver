import { renderHook, RenderHookOptions } from "@testing-library/react";
import React from "react";

interface CustomRenderHookOptions<TProps> extends Omit<RenderHookOptions<TProps>, "wrapper"> {
  // Add any custom options here
  initialProps?: TProps;
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: CustomRenderHookOptions<TProps>
) {
  return renderHook(hook, {
    wrapper: TestWrapper,
    ...options,
  });
}

export { renderHookWithProviders as renderHook };
