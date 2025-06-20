import { faker } from "@faker-js/faker";

// Donor factory
export const donorFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    organizationId: "org-test",
    externalId: faker.string.alphanumeric(10),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode(),
    country: faker.location.country(),
    isCouple: faker.datatype.boolean(),
    spouseName: faker.person.fullName(),
    tags: faker.helpers.arrayElements(["major-donor", "recurring", "volunteer", "board-member"], { min: 0, max: 3 }),
    customFields: {},
    donorStageId: faker.helpers.arrayElement([null, "stage-1", "stage-2", "stage-3"]),
    staffId: faker.helpers.arrayElement([null, "staff-1", "staff-2"]),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => donorFactory.create(overrides));
  },
};

// Project factory
export const projectFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.company.catchPhrase(),
    description: faker.lorem.paragraph(),
    goal: faker.number.int({ min: 10000, max: 1000000 }),
    raised: faker.number.int({ min: 0, max: 500000 }),
    organizationId: "org-test",
    startDate: faker.date.future(),
    endDate: faker.date.future({ years: 1 }),
    status: faker.helpers.arrayElement(["active", "completed", "cancelled"]),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => projectFactory.create(overrides));
  },
};

// Campaign factory
export const campaignFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.commerce.productName() + " Campaign",
    description: faker.lorem.sentence(),
    status: faker.helpers.arrayElement(["draft", "scheduled", "sent", "completed"]),
    organizationId: "org-test",
    projectId: faker.string.uuid(),
    listId: faker.string.uuid(),
    templateId: faker.helpers.arrayElement([null, faker.string.uuid()]),
    scheduledAt: faker.helpers.arrayElement([null, faker.date.future()]),
    sentAt: faker.helpers.arrayElement([null, faker.date.recent()]),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => campaignFactory.create(overrides));
  },
};

// Staff factory
export const staffFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    role: faker.helpers.arrayElement(["admin", "fundraiser", "volunteer", "accountant"]),
    organizationId: "org-test",
    clerkUserId: `clerk_${faker.string.alphanumeric(20)}`,
    isActive: faker.datatype.boolean({ probability: 0.9 }),
    permissions: faker.helpers.arrayElements(["donors.view", "donors.edit", "campaigns.create", "reports.view"], { min: 1, max: 4 }),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => staffFactory.create(overrides));
  },
};

// List factory
export const listFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.commerce.department() + " List",
    description: faker.lorem.sentence(),
    organizationId: "org-test",
    donorCount: faker.number.int({ min: 0, max: 1000 }),
    tags: faker.helpers.arrayElements(["active", "inactive", "vip", "prospect"], { min: 0, max: 2 }),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => listFactory.create(overrides));
  },
};

// Communication factory
export const communicationFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    organizationId: "org-test",
    donorId: faker.string.uuid(),
    staffId: faker.string.uuid(),
    type: faker.helpers.arrayElement(["email", "phone", "meeting", "letter"]),
    subject: faker.lorem.sentence(),
    content: faker.lorem.paragraph(),
    status: faker.helpers.arrayElement(["pending", "sent", "received", "failed"]),
    direction: faker.helpers.arrayElement(["inbound", "outbound"]),
    threadId: faker.helpers.arrayElement([null, faker.string.uuid()]),
    metadata: {},
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => communicationFactory.create(overrides));
  },
};

// Email template factory
export const templateFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    name: faker.lorem.words(3),
    subject: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(3),
    organizationId: "org-test",
    type: faker.helpers.arrayElement(["donation_request", "thank_you", "update", "invitation"]),
    variables: faker.helpers.arrayElements(["donorName", "projectName", "amount", "date"], { min: 0, max: 4 }),
    isActive: faker.datatype.boolean({ probability: 0.8 }),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
  
  createMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, () => templateFactory.create(overrides));
  },
};

// Organization factory
export const organizationFactory = {
  create: (overrides = {}) => ({
    id: "org-test",
    name: faker.company.name(),
    clerkOrganizationId: `org_${faker.string.alphanumeric(20)}`,
    settings: {
      emailSignature: faker.lorem.paragraph(),
      defaultTemplateId: faker.string.uuid(),
      aiProvider: faker.helpers.arrayElement(["openai", "anthropic", "azure"]),
    },
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
};

// Session factory for campaigns
export const sessionFactory = {
  create: (overrides = {}) => ({
    id: faker.string.uuid(),
    campaignId: faker.string.uuid(),
    status: faker.helpers.arrayElement(["pending", "processing", "completed", "failed"]),
    progress: faker.number.int({ min: 0, max: 100 }),
    totalEmails: faker.number.int({ min: 10, max: 1000 }),
    generatedEmails: faker.number.int({ min: 0, max: 1000 }),
    errors: [],
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
};