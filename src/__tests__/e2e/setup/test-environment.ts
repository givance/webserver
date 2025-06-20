import { setupTestDatabase, cleanupTestDatabase } from './test-database'

// Global test environment setup
export default async function globalSetup() {
  console.log('🚀 Setting up E2E test environment...')
  
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'sqlite://./test.db'
  
  // Override environment variables for testing
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.CLERK_SECRET_KEY = 'test-clerk-secret-key'
  process.env.CLERK_WEBHOOK_SECRET = 'test-webhook-secret'
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_test-clerk-publishable-key'
  process.env.OPENAI_API_KEY = 'sk-test-openai-key'
  process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic-key'
  process.env.GOOGLE_SEARCH_API_KEY = 'test-google-api-key'
  process.env.GOOGLE_SEARCH_ENGINE_ID = 'test-search-engine-id'
  process.env.SMALL_MODEL = 'gpt-3.5-turbo'
  process.env.MID_MODEL = 'gpt-4'
  process.env.TRIGGER_SECRET_KEY = 'test-trigger-secret'
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback'
  process.env.BASE_URL = 'http://localhost:3000'
  process.env.AZURE_OPENAI_API_KEY = 'test-azure-openai-key'
  process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com'
  process.env.AZURE_OPENAI_RESOURCE_NAME = 'test-azure-resource'
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'test-deployment'

  try {
    // Setup test database
    await setupTestDatabase()
    console.log('✅ E2E test environment ready')
  } catch (error) {
    console.error('❌ Failed to setup E2E test environment:', error)
    throw error
  }
}

export async function globalTeardown() {
  console.log('🧹 Cleaning up E2E test environment...')
  
  try {
    await cleanupTestDatabase()
    console.log('✅ E2E test environment cleaned up')
  } catch (error) {
    console.error('❌ Failed to cleanup E2E test environment:', error)
  }
}

// Test user credentials
export const TEST_USER = {
  id: 'user_test123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  organizationId: 'org_test123',
}

export const TEST_ORGANIZATION = {
  id: 'org_test123',
  name: 'Test Nonprofit Organization',
  slug: 'test-nonprofit',
}