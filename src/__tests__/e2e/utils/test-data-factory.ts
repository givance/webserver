/**
 * Test data factory for consistent test data creation
 * Helps prevent race conditions by providing predictable test data
 */

export function createTestDonor(suffix?: string) {
  const unique = suffix || Math.random().toString(36).substr(2, 9);
  return {
    firstName: `TestDonor${unique}`,
    lastName: "TestUser",
    email: `testdonor${unique}@example.com`,
    phone: "(555) 123-4567",
    address: "123 Test Street",
    city: "Test City",
    state: "NY",
    postalCode: "10001",
    country: "United States",
    notes: `Test donor created by e2e tests - ${unique}`,
  };
}

export function createTestProject(suffix?: string) {
  const unique = suffix || Math.random().toString(36).substr(2, 9);
  return {
    name: `TestProject${unique}`,
    description: `Test project created by e2e tests - ${unique}`,
    goal: "50000", // String format as expected by form
    tags: ["test", "e2e"],
  };
}

export function createTestStaff(suffix?: string) {
  const unique = suffix || Math.random().toString(36).substr(2, 9);
  return {
    firstName: `TestStaff${unique}`,
    lastName: "TestUser",
    email: `teststaff${unique}@example.com`,
    jobTitle: "Development Manager",
    department: "Engineering",
    signature: `Best regards,\nTestStaff${unique}\nTest Organization`,
    whatsappNumbers: ["+1234567890"],
    isRealPerson: true,
    isPrimary: false,
  };
}

export function createTestCampaign(suffix?: string) {
  const unique = suffix || Math.random().toString(36).substr(2, 9);
  return {
    name: `TestCampaign${unique}`,
    instruction: `Test campaign instruction - ${unique}`,
    refinedInstruction: `Refined test campaign instruction - ${unique}`,
    jobName: `Test Campaign ${unique}`,
  };
}

/**
 * Generate a unique test identifier
 * More reliable than Date.now() for concurrent tests
 */
export function generateTestId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a unique test email
 */
export function generateTestEmail(prefix = "test"): string {
  return `${prefix}${generateTestId()}@example.com`;
}

/**
 * Generate a unique test name
 */
export function generateTestName(prefix = "Test"): string {
  return `${prefix}${generateTestId()}`;
}
