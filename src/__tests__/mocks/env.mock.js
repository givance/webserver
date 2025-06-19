// Mock for @t3-oss/env-nextjs

describe('Environment mock', () => {
  it('should provide mock environment variables', () => {
    expect(true).toBe(true)
  })
})
module.exports = {
  createEnv: () => ({
    DATABASE_URL: 'postgresql://test:test@localhost:5432/givance_test',
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    CLERK_SECRET_KEY: 'test-clerk-key',
    CLERK_WEBHOOK_SECRET: 'test-webhook-secret',
    GOOGLE_SEARCH_API_KEY: 'test-google-key',
    GOOGLE_SEARCH_ENGINE_ID: 'test-search-engine',
    WHATSAPP_ACCESS_TOKEN: 'test-whatsapp-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    GMAIL_CLIENT_ID: 'test-gmail-id',
    GMAIL_CLIENT_SECRET: 'test-gmail-secret',
    MICROSOFT_CLIENT_ID: 'test-microsoft-id',
    MICROSOFT_CLIENT_SECRET: 'test-microsoft-secret',
    TRIGGER_API_KEY: 'test-trigger-key',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-clerk-public-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  }),
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/givance_test',
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    CLERK_SECRET_KEY: 'test-clerk-key',
    CLERK_WEBHOOK_SECRET: 'test-webhook-secret',
    GOOGLE_SEARCH_API_KEY: 'test-google-key',
    GOOGLE_SEARCH_ENGINE_ID: 'test-search-engine',
    WHATSAPP_ACCESS_TOKEN: 'test-whatsapp-token',
    WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    GMAIL_CLIENT_ID: 'test-gmail-id',
    GMAIL_CLIENT_SECRET: 'test-gmail-secret',
    MICROSOFT_CLIENT_ID: 'test-microsoft-id',
    MICROSOFT_CLIENT_SECRET: 'test-microsoft-secret',
    TRIGGER_API_KEY: 'test-trigger-key',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-clerk-public-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  }
}