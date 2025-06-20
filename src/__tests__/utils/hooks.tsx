import { renderHook, RenderHookOptions } from "@testing-library/react";
import { createWrapper } from "./test-utils";

interface CustomRenderHookOptions<TProps>
  extends Omit<RenderHookOptions<TProps>, "wrapper"> {
  // Add any custom options here
}

export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: CustomRenderHookOptions<TProps>
) {
  const Wrapper = createWrapper();
  return renderHook(hook, {
    wrapper: Wrapper,
    ...options,
  });
}

export { renderHookWithProviders as renderHook };