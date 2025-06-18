import { db } from "@/app/lib/db";
import { donors, donations, projects, donorListMembers } from "@/app/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
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
  ACT_DefaultADR?: string;
  ADR_Type?: string;
  Adr_Line1?: string;
  ADR_City?: string;
  ADR_State?: string;
  ADR_Zip?: string;
  ADR_ZipFour?: string;
  ADR_Country?: string;
  Email: string;
  Tel1?: string;
  Tel2?: string;
  Tel3?: string;
  Tel4?: string;
  Tel5?: string;
  Tel6?: string;
  TotalPledges?: string;
  TotalPaid?: string;
  TotalOutstanding?: string;
  DueNow?: string;
  LastAppPaymentDate?: string;
  LastPaymentAmt?: string;
  LastPaymentDate?: string;
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  Line6?: string;
  LineDear?: string;
  BothInactive?: string;
  ACT_IgnoreHim?: string;
  ACT_IgnoreHer?: string;
  StdNames?: string;
  MasterFlags?: string;
  DataSource?: string;
  AdmireProExport?: string;
  AdmireProUser?: string;
}

interface PledgeRecord {
  SystemDisplay1?: string;
  Address?: string;
  PLG_ID?: string;
  ACT_ID: string;
  PLG_Date?: string;
  PLG_Amount?: string;
  PLG_Comment?: string;
  PLG_Solicitator?: string;
  PLG_InsSpread?: string;
  OCC_Name?: string;
  TotalPaid?: string;
  Outstanding?: string;
  DueNow?: string;
  LastPayment?: string;
  PLG_ACT_ID?: string;
  Plg_Adr_Id?: string;
  SolicitorName?: string;
  PLG_DateEntered?: string;
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  Line6?: string;
  LineDear?: string;
  SPLG_AcaCodes?: string;
  OCC_ID?: string;
  ADR_Zip?: string;
  PlgAmountAsText?: string;
  TotalPaidAsText?: string;
  OutstandingAsText?: string;
  DueNowAsText?: string;
  Tels?: string;
  ReferredActId?: string;
  ReferredActName?: string;
  LTT_ID?: string;
  LTT_Code?: string;
  LTT_Description?: string;
  PLG_PeriodStartDate?: string;
  PLG_PeriodEndDate?: string;
  PLG_ForeignAmt?: string;
  PLG_ExchangeRate?: string;
  CUR_Code?: string;
  Email?: string;
  HEBDAT_Plg_Date?: string;
  DataSource?: string;
  AdmireProExport?: string;
  AdmireProUser?: string;
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
 * Parse display name into first and last name (from optimized version)
 */
function parseDisplayName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || fullName.trim() === "") {
    return { firstName: "Unknown", lastName: "Donor" };
  }

  const cleanName = fullName.trim();

  // Handle couple names (contains "and")
  if (cleanName.includes(" and ")) {
    const parts = cleanName.split(" and ");
    const firstPerson = parts[0].trim();
    const nameParts = firstPerson.split(" ");

    if (nameParts.length >= 2) {
      return {
        firstName: nameParts[nameParts.length - 2] || "Unknown",
        lastName: nameParts[nameParts.length - 1] || "Donor",
      };
    }
  }

  // Handle single names
  const nameParts = cleanName.split(" ").filter(Boolean);
  if (nameParts.length >= 2) {
    return {
      firstName: nameParts[0],
      lastName: nameParts[nameParts.length - 1],
    };
  } else if (nameParts.length === 1) {
    return {
      firstName: nameParts[0],
      lastName: "Donor",
    };
  }

  return { firstName: "Unknown", lastName: "Donor" };
}

/**
 * Extract structured name information from account record (using proven logic from optimized version)
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
  // Check if we have structured data for a couple
  const hasHisData = !!(account.ACT_HisTitle || account.ACT_HisName || account.ACT_HisInitial);
  const hasHerData = !!(account.ACT_HerTitle || account.ACT_HerName || account.ACT_HerInitial);
  const hasSharedLastName = !!account.ACT_LastName;

  if (hasHisData || hasHerData) {
    // This is structured couple data
    const isCouple = hasHisData && hasHerData;

    // Build display name from structured data
    let displayName = "";
    if (hasHisData) {
      const hisParts = [
        account.ACT_HisTitle?.trim(),
        account.ACT_HisName?.trim(),
        account.ACT_HisInitial?.trim(),
        hasSharedLastName ? account.ACT_LastName?.trim() : "",
      ].filter(Boolean);
      displayName += hisParts.join(" ");
    }

    if (hasHerData) {
      if (displayName) displayName += " and ";
      const herParts = [
        account.ACT_HerTitle?.trim(),
        account.ACT_HerName?.trim(),
        account.ACT_HerInitial?.trim(),
        hasSharedLastName ? account.ACT_LastName?.trim() : "",
      ].filter(Boolean);
      displayName += herParts.join(" ");
    }

    // Fallback to Line2 if structured display name is empty
    if (!displayName.trim()) {
      displayName = account.Line2 || "Unknown Donor";
    }

    // For legacy firstName/lastName, use the primary person's info or fallback
    let firstName = "";
    let lastName = "";

    if (hasHisData) {
      firstName = account.ACT_HisName || "Unknown";
      lastName = account.ACT_LastName || account.ACT_HisName || "Donor";
    } else if (hasHerData) {
      firstName = account.ACT_HerName || "Unknown";
      lastName = account.ACT_LastName || account.ACT_HerName || "Donor";
    } else {
      // Parse from Line2 as fallback
      const { firstName: parsedFirst, lastName: parsedLast } = parseDisplayName(account.Line2 || "");
      firstName = parsedFirst;
      lastName = parsedLast;
    }

    return {
      firstName,
      lastName,
      hisTitle: account.ACT_HisTitle?.trim() || undefined,
      hisFirstName: account.ACT_HisName?.trim() || undefined,
      hisInitial: account.ACT_HisInitial?.trim() || undefined,
      hisLastName: hasSharedLastName ? account.ACT_LastName?.trim() : account.ACT_HisName?.trim() || undefined,
      herTitle: account.ACT_HerTitle?.trim() || undefined,
      herFirstName: account.ACT_HerName?.trim() || undefined,
      herInitial: account.ACT_HerInitial?.trim() || undefined,
      herLastName: hasSharedLastName ? account.ACT_LastName?.trim() : account.ACT_HerName?.trim() || undefined,
      displayName: displayName.trim(),
      isCouple,
    };
  } else {
    // No structured data, parse from Line2
    const { firstName, lastName } = parseDisplayName(account.Line2 || "");
    return {
      firstName,
      lastName,
      displayName: account.Line2 || "Unknown Donor",
      isCouple: false,
    };
  }
}

/**
 * Build full address from record components
 */
function buildAddress(record: AccountRecord): string {
  const parts: string[] = [];

  if (record.Adr_Line1?.trim()) {
    parts.push(record.Adr_Line1.trim());
  }

  const cityStateZip: string[] = [];
  if (record.ADR_City?.trim()) {
    cityStateZip.push(record.ADR_City.trim());
  }
  if (record.ADR_State?.trim()) {
    cityStateZip.push(record.ADR_State.trim());
  }
  if (record.ADR_Zip?.trim()) {
    let zip = record.ADR_Zip.trim();
    if (record.ADR_ZipFour?.trim()) {
      zip += `-${record.ADR_ZipFour.trim()}`;
    }
    cityStateZip.push(zip);
  }

  if (cityStateZip.length > 0) {
    parts.push(cityStateZip.join(", "));
  }

  if (record.ADR_Country?.trim() && record.ADR_Country.trim().toUpperCase() !== "USA") {
    parts.push(record.ADR_Country.trim());
  }

  return parts.join("\n");
}

/**
 * Get phone number from record (prioritizing Tel1)
 */
function getPhoneNumber(record: AccountRecord): string | null {
  const phones = [record.Tel1, record.Tel2, record.Tel3, record.Tel4, record.Tel5, record.Tel6];

  for (const phone of phones) {
    if (phone?.trim()) {
      return phone.trim();
    }
  }

  return null;
}

/**
 * Validate account record has minimum required fields
 */
function validateAccountRecord(record: AccountRecord): string[] {
  const errors: string[] = [];

  if (!record.ACT_ID) {
    errors.push("Missing ACT_ID");
  }

  // Don't require email - many records might not have emails
  // Just require some form of name information
  const names = extractStructuredNames(record);
  if (!names.firstName && !names.lastName && !record.ACT_CompanyName) {
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
 * Process CSV files and import donors and pledges with batch processing and duplicate detection
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

    // Prepare donors for batch processing (no duplicate checking, just like optimized script)
    const donorsToInsert: any[] = [];
    const donorMap = new Map<string, number>(); // ACT_ID -> donor.id
    let successfulDonors = 0;
    let failedDonors = 0;

    // Prepare all donor data first
    for (const accountRecord of accountRecords) {
      result.donorsProcessed++;

      try {
        // Validate record
        const validationErrors = validateAccountRecord(accountRecord);
        if (validationErrors.length > 0) {
          logger.info(
            `Skipping account ${accountRecord.ACT_ID} due to validation errors: ${validationErrors.join(", ")}`
          );
          result.errors.push(`Account ${accountRecord.ACT_ID}: ${validationErrors.join(", ")}`);
          result.donorsSkipped++;
          continue;
        }

        // Extract name information
        const nameInfo = extractStructuredNames(accountRecord);
        const address = buildAddress(accountRecord);
        const phone = getPhoneNumber(accountRecord);

        // Prepare new donor for batch insert (following optimized script exactly)
        const donorData = {
          organizationId: params.organizationId,
          externalId: accountRecord.ACT_ID,
          email: accountRecord.Email || "",
          firstName: nameInfo.firstName,
          lastName: nameInfo.lastName,
          hisTitle: nameInfo.hisTitle || null,
          hisFirstName: nameInfo.hisFirstName || null,
          hisInitial: nameInfo.hisInitial || null,
          hisLastName: nameInfo.hisLastName || null,
          herTitle: nameInfo.herTitle || null,
          herFirstName: nameInfo.herFirstName || null,
          herInitial: nameInfo.herInitial || null,
          herLastName: nameInfo.herLastName || null,
          displayName: nameInfo.displayName,
          isCouple: nameInfo.isCouple,
          phone: phone || null,
          address: address || null,
          state: accountRecord.ADR_State || null,
        };

        donorsToInsert.push(donorData);
        successfulDonors++;
      } catch (error) {
        logger.error(`Error preparing donor ACT_ID ${accountRecord.ACT_ID}: ${error}`);
        failedDonors++;
      }
    }

    // Insert donors in batch (exactly like optimized script)
    if (donorsToInsert.length > 0) {
      logger.info(`Inserting ${donorsToInsert.length} donors in batch...`);
      const insertedDonors = await db.insert(donors).values(donorsToInsert).returning();

      // Create donor mapping (assumes same order)
      for (let i = 0; i < insertedDonors.length; i++) {
        const donor = insertedDonors[i];
        const account = accountRecords[i]; // Assuming same order
        donorMap.set(account.ACT_ID, donor.id);
      }

      logger.info(`✅ Successfully imported ${successfulDonors} donors`);
      if (failedDonors > 0) {
        logger.info(`⚠️ Failed to prepare ${failedDonors} donors`);
      }
      result.donorsCreated = successfulDonors;
    }

    // Add all donors to the list (both new and existing)
    const listMembersToInsert: any[] = [];
    const existingListMembers = await db
      .select({ donorId: donorListMembers.donorId })
      .from(donorListMembers)
      .where(eq(donorListMembers.listId, params.listId));

    const existingMemberIds = new Set(existingListMembers.map((m) => m.donorId));

    for (const [actId, donorId] of donorMap) {
      if (!existingMemberIds.has(donorId)) {
        listMembersToInsert.push({
          listId: params.listId,
          donorId,
          addedBy: params.userId,
        });
      }
    }

    if (listMembersToInsert.length > 0) {
      logger.info(`Adding ${listMembersToInsert.length} donors to list ${params.listId}`);
      await db.insert(donorListMembers).values(listMembersToInsert);
    }

    // Process pledges if provided (batch processing)
    if (pledgeRecords.length > 0) {
      logger.info(`Processing ${pledgeRecords.length} pledge records`);

      const donationsToInsert: any[] = [];

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
          const amount = dollarsToCents(pledgeRecord.PLG_Amount || "");
          const date = parseDate(pledgeRecord.PLG_Date || "");

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

          donationsToInsert.push({
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

      // Batch insert donations
      if (donationsToInsert.length > 0) {
        logger.info(`Batch inserting ${donationsToInsert.length} donations`);
        await db.insert(donations).values(donationsToInsert);
      }
    }

    logger.info(
      `CSV import completed - Donors: ${result.donorsCreated} created, ${result.donorsUpdated} updated, ${result.donorsSkipped} skipped. Pledges: ${result.pledgesCreated} created, ${result.pledgesSkipped} skipped. Errors: ${result.errors.length}`
    );
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`CSV import failed: ${errorMessage}`);
    result.errors.push(`Import failed: ${errorMessage}`);
    return result;
  }
}
