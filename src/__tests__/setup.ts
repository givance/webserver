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

// Mock custom hooks to avoid React state issues in tests
jest.mock("@/app/hooks/use-search", () => ({
  useSearch: () => ({
    searchTerm: "",
    debouncedSearchTerm: "",
    setSearchTerm: jest.fn(),
    clearSearch: jest.fn(),
  }),
}));

jest.mock("@/app/hooks/use-pagination", () => ({
  usePagination: () => ({
    currentPage: 1,
    pageSize: 25,
    setCurrentPage: jest.fn(),
    setPageSize: jest.fn(),
    getOffset: () => 0,
    getPageCount: (total: number) => Math.ceil(total / 25),
    resetToFirstPage: jest.fn(),
  }),
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
}));

jest.mock("use-debounce", () => ({
  useDebounce: (value: any) => [value],
}));

// Mock custom hooks for donors, projects, and communications
jest.mock("@/app/hooks/use-donors", () => ({
  useDonors: jest.fn(() => ({
    listDonors: jest.fn(),
    createDonor: jest.fn(),
    updateDonor: jest.fn(),
    deleteDonor: jest.fn(),
    getDonorQuery: jest.fn(),
  })),
}));

jest.mock("@/app/hooks/use-projects", () => ({
  useProjects: jest.fn(() => ({
    listProjects: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  })),
}));

// Removed global mock for use-communications to avoid conflicts with individual test mocks

// Mock environment variables for tests
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/givance_test";
process.env.TEST_DATABASE_URL = "postgresql://test:test@localhost:5432/givance_test";

// Mock react-hot-toast
jest.mock("react-hot-toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
  },
  Toaster: () => null,
}));

// Mock sonner
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    promise: jest.fn(),
  },
  Toaster: () => null,
}));

// Mock common components
jest.mock("@/app/components/LoadingSkeleton", () => ({
  LoadingSkeleton: () => {
    const React = jest.requireActual("react");
    return React.createElement("div", { "data-testid": "loading-skeleton" }, "Loading...");
  },
}));

jest.mock("@/app/components/ErrorDisplay", () => ({
  ErrorDisplay: ({ error, title }: { error: string; title?: string }) => {
    const React = jest.requireActual("react");
    return React.createElement("div", { "data-testid": "error-display" }, [
      title && React.createElement("h2", { key: "title" }, title),
      React.createElement("p", { key: "error" }, error),
    ]);
  },
}));

jest.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => {
    const React = jest.requireActual("react");
    return React.createElement("div", { "data-testid": "skeleton", className }, "Loading...");
  },
}));

// Mock UI components that we're not testing
jest.mock("@/components/ui/data-table/DataTable", () => ({
  DataTable: ({ data, columns }: any) => {
    const React = jest.requireActual("react");
    return React.createElement(
      "table",
      { role: "table" },
      React.createElement(
        "tbody",
        {},
        data?.map((item: any, index: number) =>
          React.createElement("tr", { key: index }, React.createElement("td", {}, JSON.stringify(item)))
        )
      )
    );
  },
}));

jest.mock("@/app/components/PageSizeSelector", () => ({
  PageSizeSelector: ({ pageSize, onPageSizeChange }: any) => {
    const React = jest.requireActual("react");
    return React.createElement(
      "select",
      {
        role: "combobox",
        onChange: (e: any) => onPageSizeChange(Number(e.target.value)),
        value: pageSize,
      },
      [
        React.createElement("option", { key: "10", value: "10" }, "10"),
        React.createElement("option", { key: "25", value: "25" }, "25"),
        React.createElement("option", { key: "50", value: "50" }, "50"),
      ]
    );
  },
}));

jest.mock("@/components/ui/step-indicator", () => ({
  StepIndicator: ({ steps, currentStep }: any) => {
    const React = jest.requireActual("react");
    return React.createElement(
      "div",
      {},
      steps.map((step: string, index: number) => React.createElement("div", { key: index }, step))
    );
  },
}));

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
  useParams: () => ({}),
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
