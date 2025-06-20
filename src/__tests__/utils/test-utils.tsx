import React from "react";
import { render, RenderOptions } from "@testing-library/react";

// Simplified test wrapper - just render children without any providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Custom render function
type CustomRenderOptions = Omit<RenderOptions, "wrapper">;

export function renderWithProviders(ui: React.ReactElement, options?: CustomRenderOptions) {
  return render(ui, { wrapper: TestWrapper, ...options });
}

// Re-export everything from React Testing Library
export * from "@testing-library/react";
export { renderWithProviders as render };

// Utility function to wait for async operations
export const waitForLoadingToFinish = () => new Promise((resolve) => setTimeout(resolve, 0));

// Utility to mock window.matchMedia for responsive components
export const mockMatchMedia = (matches: boolean = false) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

// Utility to mock ResizeObserver for components that use it
export const mockResizeObserver = () => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
};

// Setup common mocks for tests
export const setupTestMocks = () => {
  mockMatchMedia();
  mockResizeObserver();
};
