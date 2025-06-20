import { trpc } from "@/app/lib/trpc/client";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

// Type helpers for mocked procedures
type MockedProcedure<T> = jest.MockedFunction<() => Promise<T>>;
type RouterOutput = inferProcedureOutput<AppRouter>;

// Create a deeply mocked tRPC client
export function createMockTRPCClient() {
  return {
    donor: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteFromList: jest.fn(),
      deleteFromAllLists: jest.fn(),
      bulkDelete: jest.fn(),
      getListCount: jest.fn(),
      research: jest.fn(),
      bulkResearch: jest.fn(),
      export: jest.fn(),
    },
    project: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    campaign: {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      generateEmails: jest.fn(),
      regenerateEmail: jest.fn(),
      getSession: jest.fn(),
      updateSession: jest.fn(),
    },
    staff: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByEmail: jest.fn(),
    },
    list: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addDonors: jest.fn(),
      removeDonors: jest.fn(),
      getDonors: jest.fn(),
    },
    communication: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getThread: jest.fn(),
    },
    organization: {
      get: jest.fn(),
      update: jest.fn(),
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    },
    template: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
    },
  };
}

// Mock specific tRPC procedures with type safety
export function mockTRPCProcedure<T extends keyof RouterOutput>(
  router: T,
  procedure: keyof RouterOutput[T],
  mockImplementation: () => any
) {
  const client = trpc as any;
  if (!client[router]) {
    client[router] = {};
  }
  if (!client[router][procedure]) {
    client[router][procedure] = {};
  }
  client[router][procedure].useQuery = jest.fn().mockReturnValue({
    data: mockImplementation(),
    isLoading: false,
    error: null,
  });
  client[router][procedure].useMutation = jest.fn().mockReturnValue({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(mockImplementation()),
    isLoading: false,
    error: null,
  });
}

// Mock tRPC hooks
export const mockUseTRPC = () => {
  const mockClient = createMockTRPCClient();
  
  // Mock useQuery for all procedures
  Object.keys(mockClient).forEach((router) => {
    Object.keys(mockClient[router as keyof typeof mockClient]).forEach((procedure) => {
      const mockedProcedure = mockClient[router as keyof typeof mockClient][procedure as keyof typeof mockClient[keyof typeof mockClient]];
      
      (mockedProcedure as any).useQuery = jest.fn().mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });
      
      (mockedProcedure as any).useMutation = jest.fn().mockReturnValue({
        mutate: jest.fn(),
        mutateAsync: jest.fn(),
        isLoading: false,
        error: null,
        reset: jest.fn(),
      });
    });
  });
  
  return mockClient;
};

// Helper to create mock data
export const createMockDonor = (overrides = {}) => ({
  id: "donor-1",
  name: "John Doe",
  email: "john@example.com",
  phone: "+1234567890",
  organizationId: "org-1",
  externalId: null,
  address: "123 Main St",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "USA",
  isCouple: false,
  spouseName: null,
  tags: [],
  customFields: {},
  donorStageId: null,
  staffId: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

export const createMockProject = (overrides = {}) => ({
  id: "project-1",
  name: "Annual Fundraiser",
  description: "Our annual fundraising campaign",
  goal: 100000,
  raised: 50000,
  organizationId: "org-1",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-12-31"),
  status: "active",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

export const createMockCampaign = (overrides = {}) => ({
  id: "campaign-1",
  name: "Spring Campaign",
  description: "Spring fundraising email campaign",
  status: "draft",
  organizationId: "org-1",
  projectId: "project-1",
  listId: "list-1",
  templateId: null,
  scheduledAt: null,
  sentAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

export const createMockStaff = (overrides = {}) => ({
  id: "staff-1",
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "+1234567890",
  role: "fundraiser",
  organizationId: "org-1",
  clerkUserId: "clerk-user-1",
  isActive: true,
  permissions: [],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

export const createMockList = (overrides = {}) => ({
  id: "list-1",
  name: "Major Donors",
  description: "List of major donors",
  organizationId: "org-1",
  donorCount: 50,
  tags: [],
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});