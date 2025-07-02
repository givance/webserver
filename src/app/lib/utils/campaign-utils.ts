/**
 * Campaign utility functions
 */

/**
 * Generate a default campaign name using organization name and current timestamp
 * Format: "[Organization Name] Campaign [yyyy-mm-dd-HH]"
 */
export function generateDefaultCampaignName(organizationName: string): string {
  const now = new Date();

  // Format: yyyy-mm-dd-HH
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");

  const timestamp = `${year}-${month}-${day}-${hour}`;

  return `${organizationName} Campaign ${timestamp}`;
}
