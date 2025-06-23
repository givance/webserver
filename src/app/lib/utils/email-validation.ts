import { db } from "@/app/lib/db";
import { donors, staff, staffGmailTokens } from "@/app/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Interface for donor validation results
 */
export interface DonorEmailValidationResult {
  isValid: boolean;
  donorsWithoutStaff: Array<{
    donorId: number;
    donorFirstName: string;
    donorLastName: string;
    donorEmail: string;
  }>;
  donorsWithStaffButNoEmail: Array<{
    donorId: number;
    donorFirstName: string;
    donorLastName: string;
    donorEmail: string;
    staffFirstName: string;
    staffLastName: string;
    staffEmail: string;
  }>;
  errorMessage?: string;
}

/**
 * Validates that all specified donors have assigned staff with connected Gmail accounts
 * @param donorIds - Array of donor IDs to validate
 * @param organizationId - Organization ID for scoping
 * @returns Validation result with details about any issues
 */
export async function validateDonorStaffEmailConnectivity(
  donorIds: number[],
  organizationId: string
): Promise<DonorEmailValidationResult> {
  if (donorIds.length === 0) {
    return {
      isValid: true,
      donorsWithoutStaff: [],
      donorsWithStaffButNoEmail: [],
    };
  }

  // Get donor and staff information with Gmail token status
  const donorsWithStaff = await db
    .select({
      donorId: donors.id,
      donorFirstName: donors.firstName,
      donorLastName: donors.lastName,
      donorEmail: donors.email,
      assignedToStaffId: donors.assignedToStaffId,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      staffEmail: staff.email,
      hasGmailToken: sql<boolean>`${staffGmailTokens.id} IS NOT NULL`,
    })
    .from(donors)
    .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
    .leftJoin(staffGmailTokens, eq(staff.id, staffGmailTokens.staffId))
    .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

  // Categorize validation errors
  const donorsWithoutStaff = donorsWithStaff
    .filter((donor) => !donor.assignedToStaffId)
    .map((donor) => ({
      donorId: donor.donorId,
      donorFirstName: donor.donorFirstName,
      donorLastName: donor.donorLastName,
      donorEmail: donor.donorEmail,
    }));

  const donorsWithStaffButNoEmail = donorsWithStaff
    .filter((donor) => donor.assignedToStaffId && !donor.hasGmailToken)
    .map((donor) => ({
      donorId: donor.donorId,
      donorFirstName: donor.donorFirstName,
      donorLastName: donor.donorLastName,
      donorEmail: donor.donorEmail,
      staffFirstName: donor.staffFirstName!,
      staffLastName: donor.staffLastName!,
      staffEmail: donor.staffEmail!,
    }));

  const isValid = donorsWithoutStaff.length === 0 && donorsWithStaffButNoEmail.length === 0;

  // Generate error message if validation failed
  let errorMessage: string | undefined;
  if (!isValid) {
    errorMessage = "Some donors don't have proper email setup:\n\n";

    if (donorsWithoutStaff.length > 0) {
      errorMessage += `• ${donorsWithoutStaff.length} donor(s) without assigned staff:\n`;
      donorsWithoutStaff.slice(0, 5).forEach((donor) => {
        errorMessage += `  - ${donor.donorFirstName} ${donor.donorLastName} (${donor.donorEmail})\n`;
      });
      if (donorsWithoutStaff.length > 5) {
        errorMessage += `  ... and ${donorsWithoutStaff.length - 5} more\n`;
      }
      errorMessage += "\n";
    }

    if (donorsWithStaffButNoEmail.length > 0) {
      errorMessage += `• ${donorsWithStaffButNoEmail.length} donor(s) with staff who don't have connected Gmail accounts:\n`;
      donorsWithStaffButNoEmail.slice(0, 5).forEach((donor) => {
        errorMessage += `  - ${donor.donorFirstName} ${donor.donorLastName} → Staff: ${donor.staffFirstName} ${donor.staffLastName} (no Gmail connected)\n`;
      });
      if (donorsWithStaffButNoEmail.length > 5) {
        errorMessage += `  ... and ${donorsWithStaffButNoEmail.length - 5} more\n`;
      }
      errorMessage += "\n";
    }

    errorMessage +=
      "Please assign staff to all donors and ensure all assigned staff have connected their Gmail accounts.";
  }

  return {
    isValid,
    donorsWithoutStaff,
    donorsWithStaffButNoEmail,
    errorMessage,
  };
}

/**
 * Generates a user-friendly summary of email validation issues
 * @param result - Validation result from validateDonorStaffEmailConnectivity
 * @returns Human-readable summary string
 */
export function formatEmailValidationSummary(result: DonorEmailValidationResult): string {
  if (result.isValid) {
    return "All donors have assigned staff with connected Gmail accounts";
  }

  const issues: string[] = [];

  if (result.donorsWithoutStaff.length > 0) {
    issues.push(`${result.donorsWithoutStaff.length} donor(s) without assigned staff`);
  }

  if (result.donorsWithStaffButNoEmail.length > 0) {
    issues.push(`${result.donorsWithStaffButNoEmail.length} donor(s) with staff who don't have connected Gmail`);
  }

  return `Email setup issues: ${issues.join(", ")}`;
}
