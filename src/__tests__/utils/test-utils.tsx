import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";


// Create test query client with disabled retries
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface TestProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

// Custom render function with all providers
type CustomRenderOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient;
};

export function createWrapper(queryClient?: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const client = queryClient || createTestQueryClient();
    
    // Skip TRPC provider in tests - we'll mock at the hook level
    return (
      <ClerkProvider>
        <QueryClientProvider client={client}>
          {children}
          <Toaster position="top-center" />
        </QueryClientProvider>
      </ClerkProvider>
    );
  };
}

export function renderWithProviders(ui: React.ReactElement, options?: CustomRenderOptions) {
  const { queryClient, ...renderOptions } = options || {};
  const Wrapper = createWrapper(queryClient);
  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
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
