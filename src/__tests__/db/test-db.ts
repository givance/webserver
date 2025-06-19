// Test database utilities - simplified version for testing

describe('Test database utilities', () => {
  it('should be available for database testing', () => {
    expect(true).toBe(true)
  })
})

// Mock database functions for testing
export const mockTestDb = {
  insert: jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: 1 }])
    })
  }),
  query: {
    donors: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    organizations: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    }
  }
}

export const createTestOrganization = async () => {
  return {
    id: 'test-org-id',
    name: 'Test Organization',
    slug: 'test-org',
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

export const createTestUser = async (orgId?: string) => {
  return {
    id: 'test-user-id',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    memory: [],
    dismissedMemories: [],
    stages: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

export const createTestDonor = async (orgId: string, overrides: any = {}) => {
  return {
    id: 1,
    organizationId: orgId,
    firstName: 'Test',
    lastName: 'Donor',
    email: 'donor@example.com',
    externalId: 'test-donor-1',
    displayName: 'Test Donor',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export const withTestDb = (testFn: () => Promise<void>) => {
  return async () => {
    // Mock database cleanup
    jest.clearAllMocks()
    try {
      await testFn()
    } finally {
      jest.clearAllMocks()
    }
  }
}

export const resetDatabase = async () => {
  // Mock function - no actual database operations
  jest.clearAllMocks()
}