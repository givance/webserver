import "@testing-library/jest-dom";
import { loadEnvConfig } from "@next/env";
import "./mocks/env.mock";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Test setup
describe("Test setup", () => {
  it("should configure test environment", () => {
    expect(true).toBe(true);
  });
});

// Polyfills are loaded in setupFiles, so no need to duplicate here

// Mock environment variables for tests
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/givance_test";
process.env.TEST_DATABASE_URL = "postgresql://test:test@localhost:5432/givance_test";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => "/",
}));

// Mock Clerk authentication
jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "test-user-id",
    orgId: "test-org-id",
    isLoaded: true,
    isSignedIn: true,
  }),
  useUser: () => ({
    user: {
      id: "test-user-id",
      firstName: "Test",
      lastName: "User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
    },
    isLoaded: true,
  }),
  useOrganization: () => ({
    organization: {
      id: "test-org-id",
      name: "Test Organization",
    },
    isLoaded: true,
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => "UserButton",
}));

// Mock environment variables
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/givance_test";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.GOOGLE_SEARCH_API_KEY = "test-google-key";
process.env.GOOGLE_SEARCH_ENGINE_ID = "test-search-engine";
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-webhook-token";
process.env.WHATSAPP_ACCESS_TOKEN = "test-whatsapp-token";
