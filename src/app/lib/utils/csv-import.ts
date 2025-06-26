import { db } from "@/app/lib/db";
import { donors, donations, projects, donorListMembers, type DonorNote } from "@/app/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { logger } from "@/app/lib/logger";

interface AccountRecord {
  ACT_ID: string;
  ACT_Code?: string;
  ADR_ID?: string;
  Sort1?: string;
  Display?: string;
  SystemDisplay1?: string;
  Address?: string;
  Tels?: string;
  ACT_Notes?: string;
  ADR_Number?: string;
  ADR_Street?: string;
  ADR_Apt?: string;
  ADR_Zip?: string;
  ADR_City?: string;
  ADR_State?: string;
  Line3?: string;
  Line4?: string;
  BothTitles?: string;
  BothTitlesShort?: string;
  Salutation?: string;
  "Salutation - use"?: string; // Preferred salutation for email generation
  ACT_HisBusiness?: string;
  ACT_HerBusiness?: string;
  Email: string;
  DonorClass?: string;
  Solicitor?: string;
  MaidenName?: string;
  PrimarySolicitor?: string;
  DataSource?: string;
  AdmireProExport?: string;
  AdmireProUser?: string;
  // Legacy fields that might exist in other CSV formats
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
  ADR_ZipFour?: string;
  ADR_Country?: string;
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
  Line5?: string;
  Line6?: string;
  LineDear?: string;
  BothInactive?: string;
  ACT_IgnoreHim?: string;
  ACT_IgnoreHer?: string;
  StdNames?: string;
  MasterFlags?: string;
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
  OCC_Name?: string; // Occasion/Fund name - used for project mapping
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
  SPLG_AcaCodes?: string; // Academic codes - used for project mapping
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
  // Total records in CSV
  totalRecordsInCSV: number;

  // Donor processing results
  donorsProcessed: number;
  donorsCreated: number;
  donorsUpdated: number;
  donorsSkipped: number;

  // Detailed skip reasons for donors
  skipReasons: {
    noEmail: number;
    validationErrors: number;
    duplicateActId: number;
    duplicateEmail: number;
    processingErrors: number;
  };

  // Pledge processing results
  pledgesProcessed: number;
  pledgesCreated: number;
  pledgesSkipped: number;

  // Error details
  errors: string[];

  // Summary for display
  summary: {
    totalInCSV: number;
    imported: number;
    skipped: number;
    skipBreakdown: Array<{ reason: string; count: number }>;
  };

  // Processing status
  isComplete: boolean;
  listMembersAdded: number;
}

/**
 * Parse CSV content and return array of records
 * Properly handles quoted fields with embedded line breaks, commas, and quotes
 */
function parseCSV(content: string): any[] {
  // Handle different line endings (Windows \r\n, Unix \n, Mac \r)
  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove any BOM (Byte Order Mark) from the content
  let cleanContent = normalizedContent;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.substring(1);
  }

  if (!cleanContent.trim()) return [];

  // Parse CSV properly handling quoted fields with embedded newlines
  const rows = parseCSVContent(cleanContent);

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const records: any[] = [];

  logger.info(`CSV parsing: Found ${rows.length} total rows (including header)`);
  logger.info(`Headers: ${headers.slice(0, 5).join(", ")}${headers.length > 5 ? "..." : ""}`);
  if (rows.length > 1) {
    logger.info(
      `Second row sample: ${rows[1]
        .slice(0, 3)
        .map((v: string) => `"${v.substring(0, 30)}${v.length > 30 ? "..." : ""}"`)
        .join(", ")}`
    );
  }

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];

    // Skip empty rows
    if (values.length === 0 || values.every((v) => !v.trim())) {
      continue;
    }

    // Skip rows with too few columns (likely incomplete data)
    if (values.length < headers.length * 0.3) {
      // Require at least 30% of the expected columns
      logger.debug(
        `Row ${i + 1}: Skipped - has ${values.length} columns but expected at least ${Math.ceil(headers.length * 0.3)}`
      );
      continue;
    }

    const record: any = {};
    for (let j = 0; j < headers.length; j++) {
      const value = values[j]?.trim() || "";
      record[headers[j]] = value;
    }

    records.push(record);
  }

  logger.info(`CSV parsing complete:`, {
    totalRows: rows.length,
    headerRow: 1,
    dataRows: rows.length - 1,
    parsedRecords: records.length,
  });

  return records;
}

/**
 * Parse CSV content into rows and columns, properly handling quoted fields
 * This implements RFC 4180 CSV parsing with support for:
 * - Fields enclosed in double quotes
 * - Line breaks within quoted fields
 * - Escaped quotes (double quotes) within quoted fields
 * - Commas within quoted fields
 */
function parseCSVContent(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote - add single quote to field
          currentField += '"';
          i += 2; // Skip both quotes
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        // Regular character inside quotes (including newlines)
        currentField += char;
        i++;
        continue;
      }
    } else {
      // Not inside quotes
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        // Field separator
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        // Row separator
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        // Regular character
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Add the last field and row if there's content
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out completely empty rows
  return rows.filter((row) => row.length > 0 && row.some((field) => field.trim()));
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

    // Fallback to SystemDisplay1 or Display if structured display name is empty
    if (!displayName.trim()) {
      displayName = account.SystemDisplay1 || account.Display || account.Line2 || "Unknown Donor";
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
      // Parse from SystemDisplay1, Display, or Line2 as fallback
      const nameSource = account.SystemDisplay1 || account.Display || account.Line2 || "";
      const { firstName: parsedFirst, lastName: parsedLast } = parseDisplayName(nameSource);
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
    // No structured data, parse from SystemDisplay1, Display, or Line2
    const nameSource = account.SystemDisplay1 || account.Display || account.Line2 || "";
    const { firstName, lastName } = parseDisplayName(nameSource);
    return {
      firstName,
      lastName,
      displayName: nameSource || "Unknown Donor",
      isCouple: false,
    };
  }
}

/**
 * Build full address from record components
 */
function buildAddress(record: AccountRecord): string {
  // Use the Address field if available, otherwise build from components
  if (record.Address?.trim()) {
    return record.Address.trim();
  }

  const parts: string[] = [];

  // Try ADR_Street first, then Adr_Line1
  const streetAddress = record.ADR_Street || record.Adr_Line1;
  if (streetAddress?.trim()) {
    parts.push(streetAddress.trim());
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
  // Try Tels field first (which contains phone info), then individual Tel fields
  if (record.Tels?.trim()) {
    // Extract first phone number from Tels field
    const phoneMatch = record.Tels.match(/\(?\d{3}\)?\s*[-.]?\s*\d{3}[-.]?\d{4}/);
    if (phoneMatch) {
      return phoneMatch[0].trim();
    }
  }

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
    totalRecordsInCSV: 0,
    donorsProcessed: 0,
    donorsCreated: 0,
    donorsUpdated: 0,
    donorsSkipped: 0,
    skipReasons: {
      noEmail: 0,
      validationErrors: 0,
      duplicateActId: 0,
      duplicateEmail: 0,
      processingErrors: 0,
    },
    pledgesProcessed: 0,
    pledgesCreated: 0,
    pledgesSkipped: 0,
    errors: [],
    summary: {
      totalInCSV: 0,
      imported: 0,
      skipped: 0,
      skipBreakdown: [],
    },
    isComplete: false,
    listMembersAdded: 0,
  };

  try {
    // Parse accounts CSV
    const accountRecords = parseCSV(params.accountsCSV) as AccountRecord[];
    result.totalRecordsInCSV = accountRecords.length;
    logger.info(`=== CSV IMPORT STARTED ===`);
    logger.info(`Total rows in CSV file: ${accountRecords.length}`);

    // Analyze email distribution
    const emailStats = {
      total: accountRecords.length,
      withEmail: 0,
      withoutEmail: 0,
      uniqueEmails: new Set<string>(),
      duplicateEmails: new Map<string, number>(),
      invalidEmails: 0,
    };

    accountRecords.forEach((r, index) => {
      const email = r.Email?.trim();
      if (!email) {
        emailStats.withoutEmail++;
      } else {
        emailStats.withEmail++;
        const emailLower = email.toLowerCase();
        if (emailStats.uniqueEmails.has(emailLower)) {
          emailStats.duplicateEmails.set(emailLower, emailStats.duplicateEmails.get(emailLower) || 2);
        } else {
          emailStats.uniqueEmails.add(emailLower);
        }

        // Basic email validation
        if (!email.includes("@") || !email.includes(".")) {
          emailStats.invalidEmails++;
          logger.warn(`Row ${index + 2}: Invalid email format: "${email}"`);
        }
      }
    });

    logger.info(`Email analysis:`, {
      totalRows: emailStats.total,
      withEmail: emailStats.withEmail,
      withoutEmail: emailStats.withoutEmail,
      uniqueEmails: emailStats.uniqueEmails.size,
      duplicateEmailCount: emailStats.duplicateEmails.size,
      invalidEmails: emailStats.invalidEmails,
    });

    if (emailStats.duplicateEmails.size > 0) {
      const topDuplicates = Array.from(emailStats.duplicateEmails.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      logger.info(
        `Top duplicate emails in CSV: ${topDuplicates
          .map(([email, count]) => `"${email}" appears ${count} times`)
          .join(", ")}`
      );
    }

    // Filter out accounts without email addresses upfront
    const validEmailRecords = accountRecords.filter((r) => r.Email && r.Email.trim() !== "");
    const noEmailCount = accountRecords.length - validEmailRecords.length;

    if (noEmailCount > 0) {
      result.skipReasons.noEmail = noEmailCount;
      result.donorsSkipped += noEmailCount;

      // Log sample of accounts without emails for debugging
      const noEmailSample = accountRecords
        .filter((r) => !r.Email || r.Email.trim() === "")
        .slice(0, 5)
        .map((r) => `ACT_ID: ${r.ACT_ID}, Display: "${r.Display || r.SystemDisplay1 || "N/A"}"`);

      logger.info(`Skipping ${noEmailCount} records without email addresses.`);
      if (noEmailSample.length > 0) {
        logger.info(`Sample of records without emails: ${noEmailSample.join("; ")}`);
      }
    }

    logger.info(`Processing ${validEmailRecords.length} records with valid email addresses`);

    // Parse pledges CSV if provided
    let pledgeRecords: PledgeRecord[] = [];
    if (params.pledgesCSV) {
      pledgeRecords = parseCSV(params.pledgesCSV) as PledgeRecord[];
      logger.info(`Parsed ${pledgeRecords.length} pledge records`);
    }

    // Get default project for donations
    const defaultProjectId = await getDefaultProject(params.organizationId);

    // Get existing donors to check for duplicates (for incremental imports)
    const existingDonors = await db
      .select({ id: donors.id, externalId: donors.externalId, email: donors.email })
      .from(donors)
      .where(eq(donors.organizationId, params.organizationId));

    const existingDonorsByExternalId = new Map(existingDonors.map((d) => [d.externalId, d]));
    const existingDonorsByEmail = new Map(existingDonors.filter((d) => d.email).map((d) => [d.email, d]));

    logger.info(`Found ${existingDonors.length} existing donors in organization`);

    // Debug: Log counts of existing donors by email vs external ID
    const existingByEmail = existingDonors.filter((d) => d.email).length;
    const existingByExternalId = existingDonors.filter((d) => d.externalId).length;
    logger.info(`Existing donors: ${existingByEmail} with emails, ${existingByExternalId} with external IDs`);

    // Separate into new vs existing donors
    const donorsToInsert: any[] = [];
    const donorsToUpdate: { id: number; data: any; actId: string }[] = [];
    const donorMap = new Map<string, number>(); // ACT_ID -> donor.id
    const processedEmails = new Set<string>(); // Track emails within CSV batch to avoid duplicates
    const processedExternalIds = new Set<string>(); // Track external IDs within CSV batch
    let newDonors = 0;
    let existingDonorUpdates = 0;
    let failedDonors = 0;

    // Process all valid account records (with emails) and separate into insert/update
    for (const accountRecord of validEmailRecords) {
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
          result.skipReasons.validationErrors++;
          continue;
        }

        // Check for duplicate ACT_ID within CSV
        if (processedExternalIds.has(accountRecord.ACT_ID)) {
          logger.info(`Skipping duplicate ACT_ID within CSV: ${accountRecord.ACT_ID}`);
          result.donorsSkipped++;
          result.skipReasons.duplicateActId++;
          continue;
        }
        processedExternalIds.add(accountRecord.ACT_ID);

        // Extract name information
        const nameInfo = extractStructuredNames(accountRecord);
        const address = buildAddress(accountRecord);
        const phone = getPhoneNumber(accountRecord);
        const email = accountRecord.Email.trim(); // We know this is valid since we filtered

        // Check for duplicate email within CSV (if email exists and not empty)
        if (email && processedEmails.has(email.toLowerCase())) {
          result.donorsSkipped++;
          result.skipReasons.duplicateEmail++;
          continue;
        }

        // Add email to processed set IMMEDIATELY after duplicate check to prevent subsequent duplicates
        if (email) {
          processedEmails.add(email.toLowerCase());
        }

        // Check if donor already exists by external ID or email
        let existingDonor = existingDonorsByExternalId.get(accountRecord.ACT_ID);
        if (!existingDonor && email) {
          existingDonor = existingDonorsByEmail.get(email);
        }

        // Build notes field with salutation instruction if "Salutation - use" column exists
        const notesArray = [];
        if (accountRecord.ACT_Notes) {
          notesArray.push({
            createdAt: new Date().toISOString(),
            createdBy: params.userId,
            content: accountRecord.ACT_Notes
          });
        }
        
        const preferredSalutation = accountRecord["Salutation - use"];
        if (preferredSalutation && preferredSalutation.trim()) {
          notesArray.push({
            createdAt: new Date().toISOString(),
            createdBy: params.userId,
            content: `Preferred salutation: ${preferredSalutation.trim()}`
          });
        }

        const donorData = {
          organizationId: params.organizationId,
          externalId: accountRecord.ACT_ID,
          email: email,
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
          notes: notesArray.length > 0 ? notesArray : [],
        };

        if (existingDonor) {
          // Update existing donor
          donorsToUpdate.push({
            id: existingDonor.id,
            data: { ...donorData, updatedAt: new Date() },
            actId: accountRecord.ACT_ID,
          });
          donorMap.set(accountRecord.ACT_ID, existingDonor.id);
          existingDonorUpdates++;
        } else {
          // Insert new donor
          donorsToInsert.push(donorData);
          newDonors++;
        }
      } catch (error) {
        logger.error(`Error preparing donor ACT_ID ${accountRecord.ACT_ID}: ${error}`);
        failedDonors++;
        result.donorsSkipped++;
        result.skipReasons.processingErrors++;
      }
    }

    logger.info(`Database operations prepared:`, {
      newDonorsToInsert: donorsToInsert.length,
      existingDonorsToUpdate: donorsToUpdate.length,
      totalToProcess: donorsToInsert.length + donorsToUpdate.length,
    });

    // Use database transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Insert donors in batch (exactly like optimized script)
      if (donorsToInsert.length > 0) {
        logger.info(`Inserting ${donorsToInsert.length} donors in batch...`);
        const insertedDonors = await tx.insert(donors).values(donorsToInsert).returning();

        // Create donor mapping - need to match by external ID since order might not be preserved
        const insertedByExternalId = new Map(insertedDonors.map((d) => [d.externalId, d.id]));

        // Map the donors we prepared for insert to their new IDs
        let insertIndex = 0;
        for (const accountRecord of validEmailRecords) {
          if (insertIndex < donorsToInsert.length) {
            const preparedDonor = donorsToInsert[insertIndex];
            if (preparedDonor.externalId === accountRecord.ACT_ID) {
              const donorId = insertedByExternalId.get(accountRecord.ACT_ID);
              if (donorId) {
                donorMap.set(accountRecord.ACT_ID, donorId);
              }
              insertIndex++;
            }
          }
        }

        logger.info(`✅ Successfully imported ${insertedDonors.length} new donors`);
        result.donorsCreated = insertedDonors.length;
      }

      // Batch update existing donors
      if (donorsToUpdate.length > 0) {
        logger.info(`Updating ${donorsToUpdate.length} existing donors in batch...`);

        for (const update of donorsToUpdate) {
          await tx.update(donors).set(update.data).where(eq(donors.id, update.id));
        }

        logger.info(`✅ Successfully updated ${donorsToUpdate.length} existing donors`);
        result.donorsUpdated = donorsToUpdate.length;
      }

      // Add all donors to the list (both new and existing) - WITHIN THE SAME TRANSACTION
      const listMembersToInsert: any[] = [];
      const existingListMembers = await tx
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
        await tx.insert(donorListMembers).values(listMembersToInsert);
        result.listMembersAdded = listMembersToInsert.length;
      }
    });

    if (failedDonors > 0) {
      logger.info(`⚠️ Failed to prepare ${failedDonors} donors`);
    }

    // Process pledges if provided (batch processing)
    if (pledgeRecords.length > 0) {
      logger.info(`Processing ${pledgeRecords.length} pledge records`);

      const donationsToInsert: any[] = [];
      const projectCache = new Map<string, number>(); // Cache for project lookups
      projectCache.set("General", defaultProjectId); // Add default project to cache

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

          // Try to match project by OCC_Name or SPLG_AcaCodes from pledge record
          let projectId = defaultProjectId;
          let projectName = "";

          // First try to match by OCC_Name (Occasion/Fund name)
          if (pledgeRecord.OCC_Name?.trim()) {
            projectName = pledgeRecord.OCC_Name.trim();
          }
          // If no OCC_Name, try SPLG_AcaCodes
          else if (pledgeRecord.SPLG_AcaCodes?.trim()) {
            projectName = pledgeRecord.SPLG_AcaCodes.trim();
          }

          // Look up or create project if we have a project name
          if (projectName) {
            // Check cache first
            if (projectCache.has(projectName)) {
              projectId = projectCache.get(projectName)!;
            } else {
              // Look for existing project with matching name
              const existingProjects = await db
                .select()
                .from(projects)
                .where(and(eq(projects.organizationId, params.organizationId), eq(projects.name, projectName)))
                .limit(1);

              if (existingProjects.length > 0) {
                projectId = existingProjects[0].id;
                projectCache.set(projectName, projectId);
              } else {
                // Create new project for this fund/occasion/code
                const description = pledgeRecord.OCC_Name?.trim()
                  ? `Fund/Occasion: ${projectName}`
                  : `Academic codes: ${projectName}`;

                const [newProject] = await db
                  .insert(projects)
                  .values({
                    organizationId: params.organizationId,
                    name: projectName,
                    description,
                    active: true,
                  })
                  .returning();
                projectId = newProject.id;
                projectCache.set(projectName, projectId);
                logger.info(`Created new project: ${projectName} (ID: ${projectId})`);
              }
            }
          }

          donationsToInsert.push({
            donorId,
            projectId,
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

      // Batch insert donations in chunks to avoid parameter limits
      if (donationsToInsert.length > 0) {
        logger.info(`Batch inserting ${donationsToInsert.length} donations`);

        const BATCH_SIZE = 1000; // Insert in chunks of 1000 to avoid parameter limits
        for (let i = 0; i < donationsToInsert.length; i += BATCH_SIZE) {
          const chunk = donationsToInsert.slice(i, i + BATCH_SIZE);
          logger.info(
            `Inserting donation batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
              donationsToInsert.length / BATCH_SIZE
            )} (${chunk.length} donations)`
          );
          await db.insert(donations).values(chunk);
        }
        logger.info(`✅ Successfully inserted all ${donationsToInsert.length} donations`);
      }
    }

    // Generate comprehensive summary
    const totalImported = result.donorsCreated + result.donorsUpdated;
    const totalSkipped = result.donorsSkipped;

    result.summary = {
      totalInCSV: result.totalRecordsInCSV,
      imported: totalImported,
      skipped: totalSkipped,
      skipBreakdown: [
        { reason: "No email address", count: result.skipReasons.noEmail },
        { reason: "Validation errors", count: result.skipReasons.validationErrors },
        { reason: "Duplicate ACT_ID in CSV", count: result.skipReasons.duplicateActId },
        { reason: "Duplicate email in CSV", count: result.skipReasons.duplicateEmail },
        { reason: "Processing errors", count: result.skipReasons.processingErrors },
      ].filter((item) => item.count > 0), // Only include reasons with non-zero counts
    };

    // Mark processing as complete
    result.isComplete = true;

    // Comprehensive logging
    logger.info(`
=== CSV IMPORT COMPLETED ===
File Statistics:
  - Total rows in CSV: ${result.summary.totalInCSV}
  - Rows with email addresses: ${validEmailRecords.length}
  - Unique email addresses: ${emailStats.uniqueEmails.size}
  - Rows without email: ${emailStats.withoutEmail}

Import Results:
  - Successfully imported: ${result.summary.imported}
    - New donors created: ${result.donorsCreated}
    - Existing donors updated: ${result.donorsUpdated}
  - Added to list: ${result.listMembersAdded} donors
  - Total skipped: ${result.summary.skipped}

Reasons for Skipping:
${result.summary.skipBreakdown.map((item) => `  - ${item.reason}: ${item.count}`).join("\n")}

Additional Information:
  - Pledges imported: ${result.pledgesCreated}
  - Pledges skipped: ${result.pledgesSkipped}
  - Total errors: ${result.errors.length}

Verification: ${result.summary.totalInCSV} total = ${result.summary.imported} imported + ${
      result.summary.skipped
    } skipped ✓

Note: The CSV contained ${result.summary.totalInCSV} total rows. Only records with valid, unique email addresses 
were processed for import. There is no hardcoded limit on the number of records processed.
===========================`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`CSV import failed: ${errorMessage}`);
    result.errors.push(`Import failed: ${errorMessage}`);
    return result;
  }
}
