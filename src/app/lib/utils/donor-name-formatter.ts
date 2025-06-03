/**
 * Utility functions for formatting donor names based on the new schema structure.
 * Prefers displayName, then his/her names, with fallback to deprecated firstName/lastName.
 */

export interface DonorNameFields {
  // Preferred field
  displayName?: string | null;

  // New couple structure fields
  hisTitle?: string | null;
  hisFirstName?: string | null;
  hisInitial?: string | null;
  hisLastName?: string | null;
  herTitle?: string | null;
  herFirstName?: string | null;
  herInitial?: string | null;
  herLastName?: string | null;
  isCouple?: boolean | null;

  // Deprecated fields (for fallback only)
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Formats a donor's name using the new schema structure.
 * Priority order:
 * 1. displayName if it exists
 * 2. Construct from his/her names if they exist
 * 3. Fall back to deprecated firstName/lastName if nothing else available
 *
 * @param donor - Object containing donor name fields
 * @returns Formatted donor name string
 */
export function formatDonorName(donor: DonorNameFields): string {
  // First priority: use displayName if it exists
  if (donor.displayName?.trim()) {
    return donor.displayName.trim();
  }

  // Second priority: construct from his/her names
  const hisName = constructIndividualName(donor.hisTitle, donor.hisFirstName, donor.hisInitial, donor.hisLastName);

  const herName = constructIndividualName(donor.herTitle, donor.herFirstName, donor.herInitial, donor.herLastName);

  // If both his and her names exist, combine them
  if (hisName && herName) {
    return `${hisName} and ${herName}`;
  }

  // If only one exists, use that one
  if (hisName) {
    return hisName;
  }

  if (herName) {
    return herName;
  }

  // Final fallback: use deprecated firstName/lastName
  if (donor.firstName?.trim() || donor.lastName?.trim()) {
    const firstName = donor.firstName?.trim() || "";
    const lastName = donor.lastName?.trim() || "";
    return `${firstName} ${lastName}`.trim();
  }

  // If nothing is available, return a placeholder
  return "Unknown Donor";
}

/**
 * Constructs an individual name from title, first name, initial, and last name.
 *
 * @param title - Title (Mr., Mrs., Dr., etc.)
 * @param firstName - First name
 * @param initial - Middle initial
 * @param lastName - Last name
 * @returns Formatted individual name or null if no name components exist
 */
function constructIndividualName(
  title?: string | null,
  firstName?: string | null,
  initial?: string | null,
  lastName?: string | null
): string | null {
  const parts: string[] = [];

  if (title?.trim()) {
    parts.push(title.trim());
  }

  if (firstName?.trim()) {
    parts.push(firstName.trim());
  }

  if (initial?.trim()) {
    // Ensure initial has a period if it doesn't already
    const initialStr = initial.trim();
    parts.push(initialStr.endsWith(".") ? initialStr : `${initialStr}.`);
  }

  if (lastName?.trim()) {
    parts.push(lastName.trim());
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Gets the appropriate salutation for a donor based on their name structure.
 * Used for email greetings.
 *
 * @param donor - Object containing donor name fields
 * @returns Appropriate salutation (e.g., "Dear Mr. Smith", "Dear John and Jane")
 */
export function getDonorSalutation(donor: DonorNameFields): string {
  // If displayName exists, use it with "Dear"
  if (donor.displayName?.trim()) {
    return `Dear ${donor.displayName.trim()}`;
  }

  // For couples, construct appropriate salutation
  if (donor.isCouple) {
    const hisName = constructIndividualName(donor.hisTitle, donor.hisFirstName, donor.hisInitial, donor.hisLastName);

    const herName = constructIndividualName(donor.herTitle, donor.herFirstName, donor.herInitial, donor.herLastName);

    if (hisName && herName) {
      return `Dear ${hisName} and ${herName}`;
    }
  }

  // For individual donors, use title + last name if available, otherwise first name
  const title = donor.hisTitle || donor.herTitle;
  const firstName = donor.hisFirstName || donor.herFirstName;
  const lastName = donor.hisLastName || donor.herLastName;

  if (title && lastName) {
    return `Dear ${title} ${lastName}`;
  }

  if (firstName) {
    return `Dear ${firstName}`;
  }

  // Fallback to deprecated fields
  if (donor.firstName?.trim()) {
    return `Dear ${donor.firstName.trim()}`;
  }

  return "Dear Friend";
}
