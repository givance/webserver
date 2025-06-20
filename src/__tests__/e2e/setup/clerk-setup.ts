import { clerkSetup } from '@clerk/testing/playwright'

export default async function globalSetup() {
  console.log('🔐 Setting up Clerk for E2E testing...')
  await clerkSetup()
  console.log('✅ Clerk setup complete')
}