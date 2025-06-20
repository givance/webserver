import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { users, organizations, organizationMemberships, donors, projects, campaigns } from '@/app/lib/db/schema'
import { sql } from 'drizzle-orm'

// Test database URL
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/givance_test'

let testDb: ReturnType<typeof drizzle>
let testSql: postgres.Sql

export async function setupTestDatabase() {
  try {
    // Create connection to test database
    testSql = postgres(TEST_DATABASE_URL, { max: 1 })
    testDb = drizzle(testSql)

    // Run migrations
    await migrate(testDb, { migrationsFolder: './drizzle/migrations' })

    // Clear existing test data
    await clearTestData()

    // Seed test data
    await seedTestData()

    console.log('✅ Test database setup complete')
    return testDb
  } catch (error) {
    console.error('❌ Test database setup failed:', error)
    throw error
  }
}

export async function clearTestData() {
  if (!testDb) return

  // Clear in reverse dependency order
  await testDb.delete(campaigns)
  await testDb.delete(donors)
  await testDb.delete(projects)
  await testDb.delete(organizationMemberships)
  await testDb.delete(organizations)
  await testDb.delete(users)
}

export async function seedTestData() {
  if (!testDb) return

  // Create test organization
  const [testOrg] = await testDb.insert(organizations).values({
    id: 'org_test123',
    name: 'Test Nonprofit Organization',
    slug: 'test-nonprofit',
    description: 'A test nonprofit for E2E testing',
    createdBy: 'user_test123',
    websiteUrl: 'https://test-nonprofit.org',
    websiteSummary: 'Test nonprofit helping communities through technology',
  }).returning()

  // Create test user
  const [testUser] = await testDb.insert(users).values({
    id: 'user_test123',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    profileImageUrl: 'https://example.com/avatar.jpg',
    emailSignature: 'Best regards,\nTest User\nTest Nonprofit Organization',
  }).returning()

  // Create organization membership
  await testDb.insert(organizationMemberships).values({
    organizationId: 'org_test123',
    userId: 'user_test123',
    role: 'admin',
  })

  // Create test donors
  const testDonors = [
    {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1-555-0101',
      organizationId: 'org_test123',
      totalDonated: 150000, // $1500
      averageDonation: 50000, // $500
      donationCount: 3,
      firstDonationDate: new Date('2023-01-15'),
      lastDonationDate: new Date('2024-01-15'),
      tier: 'gold',
      status: 'active',
      stage: 'committed',
    },
    {
      id: 2,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+1-555-0102',
      organizationId: 'org_test123',
      totalDonated: 75000, // $750
      averageDonation: 25000, // $250
      donationCount: 3,
      firstDonationDate: new Date('2023-03-10'),
      lastDonationDate: new Date('2024-02-10'),
      tier: 'silver',
      status: 'active',
      stage: 'interested',
    },
    {
      id: 3,
      firstName: 'Robert',
      lastName: 'Johnson',
      email: 'robert.johnson@example.com',
      phone: '+1-555-0103',
      organizationId: 'org_test123',
      totalDonated: 250000, // $2500
      averageDonation: 83333, // ~$833
      donationCount: 3,
      firstDonationDate: new Date('2022-12-01'),
      lastDonationDate: new Date('2024-03-01'),
      tier: 'platinum',
      status: 'active',
      stage: 'champion',
    },
    {
      id: 4,
      firstName: 'Sarah',
      lastName: 'Williams',
      email: 'sarah.williams@example.com',
      phone: '+1-555-0104',
      organizationId: 'org_test123',
      totalDonated: 25000, // $250
      averageDonation: 25000, // $250
      donationCount: 1,
      firstDonationDate: new Date('2024-01-20'),
      lastDonationDate: new Date('2024-01-20'),
      tier: 'bronze',
      status: 'active',
      stage: 'new',
    },
    {
      id: 5,
      firstName: 'Michael',
      lastName: 'Brown',
      email: 'michael.brown@example.com',
      phone: '+1-555-0105',
      organizationId: 'org_test123',
      totalDonated: 500000, // $5000
      averageDonation: 100000, // $1000
      donationCount: 5,
      firstDonationDate: new Date('2022-06-15'),
      lastDonationDate: new Date('2024-02-15'),
      tier: 'platinum',
      status: 'active',
      stage: 'champion',
    }
  ]

  await testDb.insert(donors).values(testDonors)

  // Create test project
  const [testProject] = await testDb.insert(projects).values({
    id: 1,
    name: 'Community Technology Center',
    description: 'Building a technology center for underserved communities',
    organizationId: 'org_test123',
    goalAmount: 1000000, // $10,000
    raisedAmount: 350000, // $3,500
    status: 'active',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
  }).returning()

  // Create test campaigns
  const testCampaigns = [
    {
      id: 1,
      name: 'Spring Fundraising Campaign',
      subject: 'Help Us Build a Better Future',
      organizationId: 'org_test123',
      projectId: 1,
      status: 'draft' as const,
      targetAmount: 500000, // $5,000
      recipientCount: 5,
      completedRecipients: 0,
    },
    {
      id: 2,
      name: 'Major Donor Outreach',
      subject: 'Exclusive Opportunity for Our Champions',
      organizationId: 'org_test123',
      projectId: 1,
      status: 'sent' as const,
      targetAmount: 1000000, // $10,000
      recipientCount: 2,
      completedRecipients: 2,
    },
    {
      id: 3,
      name: 'Year-End Giving Campaign',
      subject: 'Make a Difference This Holiday Season',
      organizationId: 'org_test123',
      projectId: 1,
      status: 'completed' as const,
      targetAmount: 750000, // $7,500
      recipientCount: 5,
      completedRecipients: 5,
    }
  ]

  await testDb.insert(campaigns).values(testCampaigns)

  console.log('✅ Test data seeded successfully')
  return {
    organization: testOrg,
    user: testUser,
    donors: testDonors,
    project: testProject,
    campaigns: testCampaigns,
  }
}

export async function cleanupTestDatabase() {
  if (testSql) {
    await testSql.end()
    console.log('✅ Test database connection closed')
  }
}

export { testDb }