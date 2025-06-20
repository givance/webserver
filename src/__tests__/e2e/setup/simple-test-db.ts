// Simple in-memory database setup for E2E tests
// This creates a lightweight test environment without requiring external database setup

export interface TestUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
}

export interface TestDonor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  totalDonated: number;
  tier: string;
  status: string;
}

export interface TestCampaign {
  id: number;
  name: string;
  subject: string;
  organizationId: string;
  status: string;
}

// Test data - simulates what would be in the database
export const TEST_DATA = {
  user: {
    id: "user_test123",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    organizationId: "org_test123",
  } as TestUser,

  organization: {
    id: "org_test123",
    name: "Test Nonprofit Organization",
    slug: "test-nonprofit",
  },

  donors: [
    {
      id: 1,
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      organizationId: "org_test123",
      totalDonated: 150000, // $1500
      tier: "gold",
      status: "active",
    },
    {
      id: 2,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      organizationId: "org_test123",
      totalDonated: 75000, // $750
      tier: "silver",
      status: "active",
    },
    {
      id: 3,
      firstName: "Robert",
      lastName: "Johnson",
      email: "robert.johnson@example.com",
      organizationId: "org_test123",
      totalDonated: 250000, // $2500
      tier: "platinum",
      status: "active",
    },
    {
      id: 4,
      firstName: "Sarah",
      lastName: "Williams",
      email: "sarah.williams@example.com",
      organizationId: "org_test123",
      totalDonated: 25000, // $250
      tier: "bronze",
      status: "active",
    },
    {
      id: 5,
      firstName: "Michael",
      lastName: "Brown",
      email: "michael.brown@example.com",
      organizationId: "org_test123",
      totalDonated: 500000, // $5000
      tier: "platinum",
      status: "active",
    },
  ] as TestDonor[],

  campaigns: [
    {
      id: 1,
      name: "Spring Fundraising Campaign",
      subject: "Help Us Build a Better Future",
      organizationId: "org_test123",
      status: "draft",
    },
    {
      id: 2,
      name: "Major Donor Outreach",
      subject: "Exclusive Opportunity for Our Champions",
      organizationId: "org_test123",
      status: "sent",
    },
    {
      id: 3,
      name: "Year-End Giving Campaign",
      subject: "Make a Difference This Holiday Season",
      organizationId: "org_test123",
      status: "completed",
    },
  ] as TestCampaign[],
};

export default function setupTestEnvironment() {
  // Set environment variables for testing
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "file:./test.db";
  process.env.CLERK_SECRET_KEY = "sk_test_test-clerk-secret-key";
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test-webhook-secret";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_test-clerk-publishable-key";
  process.env.OPENAI_API_KEY = "sk-test-openai-key";
  process.env.ANTHROPIC_API_KEY = "sk-test-anthropic-key";
  process.env.GOOGLE_SEARCH_API_KEY = "test-google-api-key";
  process.env.GOOGLE_SEARCH_ENGINE_ID = "test-search-engine-id";
  process.env.SMALL_MODEL = "gpt-3.5-turbo";
  process.env.MID_MODEL = "gpt-4";
  process.env.TRIGGER_SECRET_KEY = "tr_test-trigger-secret";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/auth/google/callback";
  process.env.BASE_URL = "http://localhost:3000";
  process.env.AZURE_OPENAI_API_KEY = "test-azure-openai-key";
  process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com";
  process.env.AZURE_OPENAI_RESOURCE_NAME = "test-azure-resource";
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "test-deployment";

  console.log("✅ Test environment configured with test data");
  return TEST_DATA;
}
