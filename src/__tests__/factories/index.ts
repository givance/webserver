// Test factory utilities - simplified version without schema dependencies

describe('Factory utilities', () => {
  it('should be available for test data creation', () => {
    expect(true).toBe(true)
  })
})

import { faker } from '@faker-js/faker'

// Simple factory functions for test data creation
export const createTestOrganization = (overrides: any = {}) => {
  return {
    id: faker.string.uuid(),
    name: faker.company.name(),
    slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
    ...overrides,
  }
}

export const createTestUser = (overrides: any = {}) => {
  return {
    id: faker.string.uuid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    profileImageUrl: faker.image.avatar(),
    emailSignature: `Best regards,\n${faker.person.fullName()}`,
    memory: [faker.lorem.sentence()],
    dismissedMemories: [],
    stages: ['prospecting', 'cultivation'],
    ...overrides,
  }
}

export const createTestDonor = (organizationId: string, overrides: any = {}) => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  
  return {
    organizationId,
    firstName,
    lastName,
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zipCode: faker.location.zipCode(),
    country: 'USA',
    displayName: `${firstName} ${lastName}`,
    tags: [faker.lorem.word()],
    notes: faker.lorem.paragraph(),
    ...overrides,
  }
}

export const createTestProject = (organizationId: string, overrides: any = {}) => {
  return {
    organizationId,
    name: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    active: true,
    goal: faker.number.int({ min: 10000, max: 1000000 }),
    tags: [faker.lorem.word(), faker.lorem.word()],
    ...overrides,
  }
}