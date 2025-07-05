import { initTRPC, TRPCError } from "@trpc/server";
import { type inferAsyncReturnType } from "@trpc/server";
import { z } from "zod";
import type { BackendUser } from "@/app/hooks/use-user";
import type { Context, ProtectedContext } from "@/app/api/trpc/context";
import { createServices } from "@/app/lib/services";

// Create mock services for testing
export const createMockServices = () => {
  const mockTodoService = {
    createTodo: jest.fn(),
    updateTodo: jest.fn(),
    deleteTodo: jest.fn(),
    getTodosByOrganization: jest.fn(),
    getTodosGroupedByType: jest.fn(),
    getTodosByDonor: jest.fn(),
    getTodosByStaff: jest.fn(),
    createTodosFromPredictedActions: jest.fn(),
  };

  // Get actual services but override with mocks where needed
  const services = createServices();
  
  // Override the todos service with the mock
  return {
    ...services,
    todos: mockTodoService,
    __mocks: {
      todos: mockTodoService,
    }
  };
};

// Mock BackendUser
export const createMockBackendUser = (overrides: Partial<BackendUser> = {}): BackendUser => ({
  id: "user-1",
  organizationId: "org-1",
  externalId: "user-1",
  externalOrgId: "org-1",
  slug: "test-org",
  role: "org:admin",
  email: "test@example.com",
  isAdmin: () => overrides.role === "org:admin" || false,
  ...overrides,
});

// Create test context
export const createTestContext = (overrides: any = {}): Context => {
  const user = overrides.auth?.user !== undefined 
    ? overrides.auth.user 
    : createMockBackendUser(overrides.user);
  
  return {
    auth: {
      user,
    },
    req: new Request("http://localhost:3000/api/trpc", {
      headers: {
        "x-trpc-source": "test",
        ...overrides.req?.headers,
      },
      ...overrides.req,
    }),
    resHeaders: new Headers(overrides.resHeaders || {}),
    services: overrides.services || {},
  };
};

// Create protected test context
export const createProtectedTestContext = (overrides: any = {}): ProtectedContext => {
  const user = createMockBackendUser(overrides.user);
  
  return {
    auth: {
      user,
    },
    req: new Request("http://localhost:3000/api/trpc", {
      headers: {
        "x-trpc-source": "test",
        ...overrides.req?.headers,
      },
      ...overrides.req,
    }),
    resHeaders: new Headers(overrides.resHeaders || {}),
    services: overrides.services || {},
  };
};

// Create inner test context (for actual router testing)
export const createInnerTestContext = async (overrides: any = {}) => {
  return createTestContext(overrides);
};

// Export context type
export type TestContext = inferAsyncReturnType<typeof createInnerTestContext>;

// Create test tRPC instance
export const createTestTRPC = () => {
  return initTRPC.context<Context>().create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof z.ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });
};

// Create test router caller
export const createTestCaller = <TRouter extends ReturnType<any>>(
  router: TRouter,
  contextOverrides: any = {}
) => {
  const t = createTestTRPC();
  const testRouter = t.router({
    test: router,
  });

  return async () => {
    const context = await createInnerTestContext(contextOverrides);
    return testRouter.createCaller(context);
  };
};

// Helper to test protected procedures
export const testProtectedProcedure = async (
  procedure: any,
  input: any,
  contextOverrides: any = {}
) => {
  const context = await createInnerTestContext(contextOverrides);
  
  // Test unauthorized access
  const unauthorizedContext = await createInnerTestContext({
    auth: { user: null },
  });
  
  await expect(
    procedure({ input, ctx: unauthorizedContext })
  ).rejects.toThrow(TRPCError);
  
  // Test authorized access
  return procedure({ input, ctx: context });
};

// Helper to test input validation
export const testInputValidation = async (
  procedure: any,
  validInput: any,
  invalidInputs: Array<{ input: any; expectedError?: string }>
) => {
  const context = await createInnerTestContext();
  
  // Test valid input
  await expect(
    procedure({ input: validInput, ctx: context })
  ).resolves.toBeDefined();
  
  // Test invalid inputs
  for (const { input, expectedError } of invalidInputs) {
    const error = await procedure({ input, ctx: context }).catch((e: any) => e);
    expect(error).toBeInstanceOf(TRPCError);
    if (expectedError) {
      expect(error.message).toContain(expectedError);
    }
  }
};

// Helper to test organization scoping
export const testOrganizationScoping = async (
  procedure: any,
  input: any,
  getResourceOrgId: (result: any) => string
) => {
  const org1Context = await createInnerTestContext({
    user: { organizationId: "org-1" },
  });
  
  const org2Context = await createInnerTestContext({
    user: { organizationId: "org-2" },
  });
  
  // Create resource with org1
  const result1 = await procedure({ input, ctx: org1Context });
  expect(getResourceOrgId(result1)).toBe("org-1");
  
  // Try to access with org2 (should fail or return different data)
  const result2 = await procedure({ input, ctx: org2Context });
  
  // Verify isolation
  if (result2 && getResourceOrgId(result2)) {
    expect(getResourceOrgId(result2)).toBe("org-2");
  }
};

// Mock service factories
export const createMockService = <T extends Record<string, any>>(
  methods: (keyof T)[]
): T => {
  const service = {} as T;
  methods.forEach((method) => {
    service[method] = jest.fn() as any;
  });
  return service;
};

// Common mock responses
export const mockPaginatedResponse = <T>(items: T[], total?: number) => ({
  items,
  total: total ?? items.length,
  page: 1,
  pageSize: 10,
  totalPages: Math.ceil((total ?? items.length) / 10),
});

// Error testing helpers
export const expectTRPCError = async (
  promise: Promise<any>,
  code: string,
  messagePattern?: string | RegExp
) => {
  await expect(promise).rejects.toThrow(TRPCError);
  
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe(code);
    if (messagePattern) {
      if (typeof messagePattern === "string") {
        expect((error as TRPCError).message).toContain(messagePattern);
      } else {
        expect((error as TRPCError).message).toMatch(messagePattern);
      }
    }
  }
};

// Batch operation testing
export const testBatchOperation = async (
  procedure: any,
  createValidInputs: (ids: string[]) => any,
  expectedBatchSize: number = 3
) => {
  const context = await createInnerTestContext();
  const ids = Array.from({ length: expectedBatchSize }, (_, i) => `id-${i + 1}`);
  
  const result = await procedure({
    input: createValidInputs(ids),
    ctx: context,
  });
  
  expect(result).toBeDefined();
  expect(Array.isArray(result) ? result.length : result.count).toBe(expectedBatchSize);
};

// Permission testing
export const testPermissionLevels = async (
  procedure: any,
  input: any,
  permissionTests: Array<{
    role: string;
    shouldSucceed: boolean;
    expectedError?: string;
  }>
) => {
  for (const { role, shouldSucceed, expectedError } of permissionTests) {
    const context = await createInnerTestContext({
      user: { role },
    });
    
    if (shouldSucceed) {
      await expect(
        procedure({ input, ctx: context })
      ).resolves.toBeDefined();
    } else {
      await expectTRPCError(
        procedure({ input, ctx: context }),
        "FORBIDDEN",
        expectedError
      );
    }
  }
};