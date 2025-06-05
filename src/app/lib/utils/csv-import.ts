import { db } from "@/app/lib/db";
import { donors, donations, projects, donorListMembers } from "@/app/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/app/lib/logger";

interface AccountRecord {
  ACT_ID: string;
  ACT_HisTitle?: string;
  ACT_HisName?: string;
  ACT_HisInitial?: string;
  ACT_LastName?: string;
  ACT_HerTitle?: string;
  ACT_HerName?: string;
  ACT_HerInitial?: string;
  ACT_CompanyName?: string;
  Email: string;
  Tel1?: string;
  Tel2?: string;
  Tel3?: string;
  Tel4?: string;
  Tel5?: string;
  Tel6?: string;
  ADR_Line1?: string;
  ADR_City?: string;
  ADR_State?: string;
  ADR_Zip?: string;
  ADR_Country?: string;
  Line2?: string; // Full display name
  TotalPledges?: string;
  TotalPaid?: string;
  TotalOutstanding?: string;
}

interface PledgeRecord {
  ACT_ID: string;
  PLG_Amount: string;
  PLG_Date: string;
  PLG_Comment?: string;
  OCC_Name?: string; // Occasion/Fund name
  Email?: string;
}

interface ProcessResult {
  donorsProcessed: number;
  donorsCreated: number;
  donorsUpdated: number;
  donorsSkipped: number;
  pledgesProcessed: number;
  pledgesCreated: number;
  pledgesSkipped: number;
  errors: string[];
}

/**
 * Parse CSV content and return array of records
 */
function parseCSV(content: string): any[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const records: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length >= headers.length) {
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ? values[index].replace(/"/g, "").trim() : "";
      });
      records.push(record);
    }
  }

  return records;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      i++;
      continue;
    } else {
      current += char;
    }
    i++;
  }

  values.push(current);
  return values;
}

/**
 * Convert dollar amount string to cents
 */
function dollarsToCents(dollarAmount: string): number {
  if (!dollarAmount || dollarAmount.trim() === "") return 0;

  const cleanAmount = dollarAmount.replace(/[$,\s]/g, "");
  const amount = parseFloat(cleanAmount);

  if (isNaN(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

/**
 * Parse date string from various formats
 */
function parseDate(dateString: string): Date | null {
  if (!dateString || dateString.trim() === "") return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch (error) {
    return null;
  }
}

/**
 * Extract structured name information from account record
 */
function extractStructuredNames(account: AccountRecord): {
  firstName: string;
  lastName: string;
  hisTitle?: string;
  hisFirstName?: string;
  hisInitial?: string;
  hisLastName?: string;
  herTitle?: string;
  herFirstName?: string;
  herInitial?: string;
  herLastName?: string;
  displayName: string;
  isCouple: boolean;
} {
  const hasHisData = !!(account.ACT_HisTitle || account.ACT_HisName || account.ACT_HisInitial);
  const hasHerData = !!(account.ACT_HerTitle || account.ACT_HerName || account.ACT_HerInitial);
  const hasSharedLastName = !!account.ACT_LastName;

  if (hasHisData || hasHerData) {
    const isCouple = hasHisData && hasHerData;

    // Build display name from structured data
    let displayName = "";
    if (hasHisData) {
      displayName += `${account.ACT_HisTitle || ""} ${account.ACT_HisName || ""} ${
        account.ACT_HisInitial || ""
      }`.trim();
      if (account.ACT_LastName) {
        displayName += ` ${account.ACT_LastName}`;
      }
    }
    if (hasHerData) {
      if (displayName) displayName += " and ";
      displayName += `${account.ACT_HerTitle || ""} ${account.ACT_HerName || ""} ${
        account.ACT_HerInitial || ""
      }`.trim();
      if (account.ACT_LastName) {
        displayName += ` ${account.ACT_LastName}`;
      }
    }

    // For legacy compatibility, use first available name
    const firstName = account.ACT_HisName || account.ACT_HerName || "";
    const lastName = account.ACT_LastName || "";

    return {
      firstName,
      lastName,
      hisTitle: account.ACT_HisTitle,
      hisFirstName: account.ACT_HisName,
      hisInitial: account.ACT_HisInitial,
      hisLastName: account.ACT_LastName,
      herTitle: account.ACT_HerTitle,
      herFirstName: account.ACT_HerName,
      herInitial: account.ACT_HerInitial,
      herLastName: account.ACT_LastName,
      displayName: displayName || account.Line2 || `${firstName} ${lastName}`.trim(),
      isCouple,
    };
  }

  // Fallback to parsing display name
  const fullName = account.Line2 || `${account.ACT_HisName || ""} ${account.ACT_LastName || ""}`.trim();
  const parts = fullName.split(" ");
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  return {
    firstName,
    lastName,
    displayName: fullName,
    isCouple: false,
  };
}

/**
 * Build address from account record
 */
function buildAddress(record: AccountRecord): string {
  const parts = [record.ADR_Line1, record.ADR_City, record.ADR_State, record.ADR_Zip, record.ADR_Country].filter(
    Boolean
  );

  return parts.join(", ");
}

/**
 * Get phone number from account record
 */
function getPhoneNumber(record: AccountRecord): string | null {
  const phones = [record.Tel1, record.Tel2, record.Tel3, record.Tel4, record.Tel5, record.Tel6]
    .filter(Boolean)
    .map((phone) => phone?.trim())
    .filter((phone) => phone && phone.length > 0);

  return phones[0] || null;
}

/**
 * Validate account record has required fields
 */
function validateAccountRecord(record: AccountRecord): string[] {
  const errors: string[] = [];

  if (!record.ACT_ID) {
    errors.push("Missing ACT_ID");
  }

  if (!record.Email) {
    errors.push("Missing Email");
  }

  const names = extractStructuredNames(record);
  if (!names.firstName && !names.lastName) {
    errors.push("Missing name information");
  }

  return errors;
}

/**
 * Validate pledge record has required fields
 */
function validatePledgeRecord(record: PledgeRecord): string[] {
  const errors: string[] = [];

  if (!record.ACT_ID) {
    errors.push("Missing ACT_ID");
  }

  if (!record.PLG_Amount) {
    errors.push("Missing PLG_Amount");
  }

  if (!record.PLG_Date) {
    errors.push("Missing PLG_Date");
  }

  return errors;
}

/**
 * Get or create a default project for donations
 */
async function getDefaultProject(organizationId: string): Promise<number> {
  // Try to find existing "General" project
  const [existingProject] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.name, "General")))
    .limit(1);

  if (existingProject) {
    return existingProject.id;
  }

  // Create default project
  const [newProject] = await db
    .insert(projects)
    .values({
      organizationId,
      name: "General",
      description: "Default project for imported donations",
      active: true,
    })
    .returning();

  return newProject.id;
}

/**
 * Process CSV files and import donors and pledges
 */
export async function processCSVFiles(params: {
  accountsCSV: string;
  pledgesCSV: string | null;
  organizationId: string;
  listId: number;
  userId: string;
}): Promise<ProcessResult> {
  const result: ProcessResult = {
    donorsProcessed: 0,
    donorsCreated: 0,
    donorsUpdated: 0,
    donorsSkipped: 0,
    pledgesProcessed: 0,
    pledgesCreated: 0,
    pledgesSkipped: 0,
    errors: [],
  };

  try {
    // Parse accounts CSV
    const accountRecords = parseCSV(params.accountsCSV) as AccountRecord[];
    logger.info(`Parsed ${accountRecords.length} account records`);

    // Parse pledges CSV if provided
    let pledgeRecords: PledgeRecord[] = [];
    if (params.pledgesCSV) {
      pledgeRecords = parseCSV(params.pledgesCSV) as PledgeRecord[];
      logger.info(`Parsed ${pledgeRecords.length} pledge records`);
    }

    // Get default project for donations
    const defaultProjectId = await getDefaultProject(params.organizationId);

    // Process donors
    const donorMap = new Map<string, number>(); // ACT_ID -> donor.id

    for (const accountRecord of accountRecords) {
      result.donorsProcessed++;

      try {
        // Validate record
        const validationErrors = validateAccountRecord(accountRecord);
        if (validationErrors.length > 0) {
          result.errors.push(`Account ${accountRecord.ACT_ID}: ${validationErrors.join(", ")}`);
          result.donorsSkipped++;
          continue;
        }

        // Extract name information
        const nameInfo = extractStructuredNames(accountRecord);
        const address = buildAddress(accountRecord);
        const phone = getPhoneNumber(accountRecord);

        // Check if donor already exists by external ID
        const [existingDonor] = await db
          .select()
          .from(donors)
          .where(and(eq(donors.organizationId, params.organizationId), eq(donors.externalId, accountRecord.ACT_ID)))
          .limit(1);

        if (existingDonor) {
          // Check if any significant fields have changed
          const hasChanges =
            existingDonor.email !== accountRecord.Email ||
            existingDonor.firstName !== nameInfo.firstName ||
            existingDonor.lastName !== nameInfo.lastName ||
            existingDonor.phone !== phone ||
            existingDonor.address !== address;

          if (hasChanges) {
            // Update existing donor
            await db
              .update(donors)
              .set({
                email: accountRecord.Email,
                firstName: nameInfo.firstName,
                lastName: nameInfo.lastName,
                hisTitle: nameInfo.hisTitle,
                hisFirstName: nameInfo.hisFirstName,
                hisInitial: nameInfo.hisInitial,
                hisLastName: nameInfo.hisLastName,
                herTitle: nameInfo.herTitle,
                herFirstName: nameInfo.herFirstName,
                herInitial: nameInfo.herInitial,
                herLastName: nameInfo.herLastName,
                displayName: nameInfo.displayName,
                isCouple: nameInfo.isCouple,
                phone,
                address,
                updatedAt: new Date(),
              })
              .where(eq(donors.id, existingDonor.id));

            result.donorsUpdated++;
          } else {
            result.donorsSkipped++;
          }

          donorMap.set(accountRecord.ACT_ID, existingDonor.id);
        } else {
          // Create new donor
          const [newDonor] = await db
            .insert(donors)
            .values({
              organizationId: params.organizationId,
              externalId: accountRecord.ACT_ID,
              email: accountRecord.Email,
              firstName: nameInfo.firstName,
              lastName: nameInfo.lastName,
              hisTitle: nameInfo.hisTitle,
              hisFirstName: nameInfo.hisFirstName,
              hisInitial: nameInfo.hisInitial,
              hisLastName: nameInfo.hisLastName,
              herTitle: nameInfo.herTitle,
              herFirstName: nameInfo.herFirstName,
              herInitial: nameInfo.herInitial,
              herLastName: nameInfo.herLastName,
              displayName: nameInfo.displayName,
              isCouple: nameInfo.isCouple,
              phone,
              address,
              state: accountRecord.ADR_State,
            })
            .returning();

          result.donorsCreated++;
          donorMap.set(accountRecord.ACT_ID, newDonor.id);
        }

        // Add donor to the list if not already a member
        const donorId = donorMap.get(accountRecord.ACT_ID)!;
        const [existingMember] = await db
          .select()
          .from(donorListMembers)
          .where(and(eq(donorListMembers.listId, params.listId), eq(donorListMembers.donorId, donorId)))
          .limit(1);

        if (!existingMember) {
          await db.insert(donorListMembers).values({
            listId: params.listId,
            donorId,
            addedBy: params.userId,
          });
        }
      } catch (error) {
        result.errors.push(
          `Error processing account ${accountRecord.ACT_ID}: ${error instanceof Error ? error.message : String(error)}`
        );
        result.donorsSkipped++;
      }
    }

    // Process pledges if provided
    if (pledgeRecords.length > 0) {
      for (const pledgeRecord of pledgeRecords) {
        result.pledgesProcessed++;

        try {
          // Validate record
          const validationErrors = validatePledgeRecord(pledgeRecord);
          if (validationErrors.length > 0) {
            result.errors.push(`Pledge for ${pledgeRecord.ACT_ID}: ${validationErrors.join(", ")}`);
            result.pledgesSkipped++;
            continue;
          }

          // Find corresponding donor
          const donorId = donorMap.get(pledgeRecord.ACT_ID);
          if (!donorId) {
            result.errors.push(`Pledge for ${pledgeRecord.ACT_ID}: Corresponding donor not found`);
            result.pledgesSkipped++;
            continue;
          }

          // Parse amount and date
          const amount = dollarsToCents(pledgeRecord.PLG_Amount);
          const date = parseDate(pledgeRecord.PLG_Date);

          if (amount <= 0) {
            result.errors.push(`Pledge for ${pledgeRecord.ACT_ID}: Invalid amount ${pledgeRecord.PLG_Amount}`);
            result.pledgesSkipped++;
            continue;
          }

          if (!date) {
            result.errors.push(`Pledge for ${pledgeRecord.ACT_ID}: Invalid date ${pledgeRecord.PLG_Date}`);
            result.pledgesSkipped++;
            continue;
          }

          // Check for duplicate donations (same donor, amount, date)
          const [existingDonation] = await db
            .select()
            .from(donations)
            .where(
              and(
                eq(donations.donorId, donorId),
                eq(donations.amount, amount),
                sql`DATE(${donations.date}) = DATE(${date})`
              )
            )
            .limit(1);

          if (existingDonation) {
            result.pledgesSkipped++;
            continue;
          }

          // Create donation record
          await db.insert(donations).values({
            donorId,
            projectId: defaultProjectId,
            amount,
            date,
            currency: "USD",
          });

          result.pledgesCreated++;
        } catch (error) {
          result.errors.push(
            `Error processing pledge for ${pledgeRecord.ACT_ID}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          result.pledgesSkipped++;
        }
      }
    }

    logger.info(`CSV import completed: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`CSV import failed: ${errorMessage}`);
    result.errors.push(`Import failed: ${errorMessage}`);
    return result;
  }
}
