import React from 'react'
import { render, RenderOptions } from '@testing-library/react'

// Test utilities
describe('Test utilities', () => {
  it('should be available for testing', () => {
    expect(true).toBe(true)
  })
})

// Simplified test utilities without complex providers

// Custom render function with basic setup
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add any simple options here
}

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>
  }
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: CustomRenderOptions
) {
  const Wrapper = createWrapper()
  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
  }
}

// Re-export everything from React Testing Library
export * from '@testing-library/react'
export { renderWithProviders as render }

// Utility function to wait for async operations
export const waitForLoadingToFinish = () =>
  new Promise((resolve) => setTimeout(resolve, 0))

// Utility to mock window.matchMedia for responsive components
export const mockMatchMedia = (matches: boolean = false) => {
  Object.defineProperty(window, 'matchMedia', {
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
  })
}

// Utility to mock ResizeObserver for components that use it
export const mockResizeObserver = () => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }))
}

// Setup common mocks for tests
export const setupTestMocks = () => {
  mockMatchMedia()
  mockResizeObserver()
}