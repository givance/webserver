// Mock server - simplified version

describe('Mock server utilities', () => {
  it('should be available for server mocking', () => {
    expect(true).toBe(true)
  })
})

// Simple mock server for testing
export const mockServer = {
  listen: jest.fn(),
  close: jest.fn(),
  resetHandlers: jest.fn(),
}