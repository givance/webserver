import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { organizations, donors, donations, projects, staff } from "../../src/app/lib/db/schema.js";
import type { InferInsertModel } from "drizzle-orm";
// @ts-ignore - xlsx provides its own types but TypeScript may not recognize them
import XLSX from "xlsx";
import dotenv from "dotenv";

dotenv.config();

// Define types for database insertions
type InsertDonor = InferInsertModel<typeof donors>;
type InsertDonation = InferInsertModel<typeof donations>;
type InsertProject = InferInsertModel<typeof projects>;
type InsertStaff = InferInsertModel<typeof staff>;

// Define interface for donor records from Excel
interface DonorRecord {
  "First Name": string;
  "Last Name": string;
  "Account Name": string;
  Email: string;
  "Total Gifts": string;
  "Largest Gift": string;
  "Last Gift Amount": string;
  "Last Gift Date": string;
}

/**
 * Parse Excel file and return array of records
 * @param filePath Path to the Excel file
 * @returns Array of parsed records
 */
function parseExcel(filePath: string): DonorRecord[] {
  try {
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON with header row
    const records = XLSX.utils.sheet_to_json<DonorRecord>(worksheet);

    console.log(`Parsed ${records.length} records from Excel file`);
    return records;
  } catch (error) {
    console.error(`Error parsing Excel file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Convert dollar amount to cents
 * @param dollarAmount String like "1234.56" or "$1,234.56", or a number
 * @returns Amount in cents as integer
 */
function dollarsToCents(dollarAmount: string | number): number {
  // Handle null, undefined, or empty string
  if (!dollarAmount) return 0;

  // Convert to string if it's a number
  const amountStr = typeof dollarAmount === "string" ? dollarAmount : dollarAmount.toString();

  // Check for empty string after conversion
  if (amountStr.trim() === "") return 0;

  // Remove currency symbols, commas, and whitespace
  const cleanAmount = amountStr.replace(/[$,\s]/g, "");
  const amount = parseFloat(cleanAmount);

  if (isNaN(amount)) {
    console.warn(`Invalid dollar amount: ${amountStr}`);
    return 0;
  }

  return Math.round(amount * 100); // Convert to cents
}

/**
 * Parse date from various formats, specifically handling MM/DD/YYYY format
 * @param dateValue Date string or number from Excel
 * @returns Date object or null if invalid
 */
function parseDate(dateValue: string | number | Date): Date | null {
  // Handle null, undefined, or empty string
  if (!dateValue) {
    console.log(`parseDate received empty value: ${dateValue}`);
    return null;
  }

  // If it's already a Date object
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      console.log(`parseDate received invalid Date object`);
      return null;
    }
    return dateValue;
  }

  // Convert to string if needed and check for empty
  if (typeof dateValue === "string" && dateValue.trim() === "") {
    console.log(`parseDate received empty string`);
    return null;
  }

  try {
    // Convert to string for consistent handling
    const dateStr = String(dateValue).trim();
    console.log(`Attempting to parse date: "${dateStr}"`);

    // Handle Excel numeric dates (number of days since Jan 1, 1900, with some quirks)
    // First check if it's a numeric string
    if (/^\d+$/.test(dateStr)) {
      console.log(`Detected Excel numeric date: ${dateStr}`);
      const excelDays = parseInt(dateStr, 10);

      // Excel date origin is 1900-01-01, but it has a bug treating 1900 as a leap year
      // Start with a date of December 30, 1899 (Excel's day 0)
      const date = new Date(Date.UTC(1899, 11, 30));

      // Add the number of days from Excel (convert to milliseconds)
      date.setUTCDate(date.getUTCDate() + excelDays);

      console.log(`Converted Excel date ${dateStr} to: ${date.toISOString()}`);
      return date;
    }

    // Handle MM/DD/YYYY format (with or without leading zeros)
    const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateMatch) {
      const [, month, day, year] = dateMatch;
      console.log(`Matched MM/DD/YYYY format: month=${month}, day=${day}, year=${year}`);
      // Month is 0-indexed in JavaScript Date
      const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

      // Verify the date is valid (not 1970-01-01)
      if (
        parsedDate.getFullYear() === parseInt(year) &&
        parsedDate.getMonth() === parseInt(month) - 1 &&
        parsedDate.getDate() === parseInt(day)
      ) {
        return parsedDate;
      } else {
        console.log(`Date components didn't match created date object, possible invalid date`);
      }
    }

    // Excel dates might come as serial numbers or other formatted strings
    const date = new Date(dateValue);
    if (isNaN(date.getTime()) || date.getFullYear() < 1980) {
      // Sanity check
      console.warn(`Invalid date format or unreasonable date: ${dateValue}`);
      return null;
    }
    return date;
  } catch (error) {
    console.warn(`Error parsing date: ${dateValue}`, error);
    return null;
  }
}

/**
 * Clean up existing data for the organization
 * @param db Database connection
 * @param organizationId Organization ID
 */
async function cleanupExistingData(db: any, organizationId: string): Promise<void> {
  console.log("🧹 Cleaning up existing data...");

  // First, get all donors for the organization
  const existingDonors = await db
    .select({ id: donors.id })
    .from(donors)
    .where(eq(donors.organizationId, organizationId));

  if (existingDonors.length > 0) {
    // Delete donations for each donor individually
    let totalDonationsDeleted = 0;
    for (const donor of existingDonors) {
      const deletedDonations = await db.delete(donations).where(eq(donations.donorId, donor.id)).returning();
      totalDonationsDeleted += deletedDonations.length;
    }
    console.log(`   Deleted ${totalDonationsDeleted} donations`);

    // Delete all donors
    const deletedDonors = await db.delete(donors).where(eq(donors.organizationId, organizationId)).returning();
    console.log(`   Deleted ${deletedDonors.length} donors`);
  }

  // Delete all projects except ones we want to keep
  const existingProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  // Optional: Keep certain projects if needed
  const projectsToKeep: string[] = [];

  if (existingProjects.length > 0) {
    const projectsToDelete = existingProjects.filter(
      (project: { name: string }) => !projectsToKeep.includes(project.name)
    );

    if (projectsToDelete.length > 0) {
      // Delete projects individually
      let totalProjectsDeleted = 0;
      for (const project of projectsToDelete) {
        const deletedProject = await db.delete(projects).where(eq(projects.id, project.id)).returning();
        totalProjectsDeleted += deletedProject.length;
      }
      console.log(`   Deleted ${totalProjectsDeleted} projects`);
    }
  }

  // Delete ALL staff for this organization to avoid ID reference issues
  const deletedStaff = await db.delete(staff).where(eq(staff.organizationId, organizationId)).returning();
  console.log(`   Deleted ${deletedStaff.length} staff members`);

  console.log("✅ Cleanup complete\n");
}

/**
 * Import data from Excel to database
 * @param organizationId Organization ID
 */
async function importDataToDatabase(organizationId: string): Promise<void> {
  // Database connection - use DATABASE_URL if available, otherwise individual params
  let pool: Pool;

  if (process.env.DATABASE_URL) {
    console.log(`🔗 Connecting to database using DATABASE_URL...`);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // ssl: true,
    });
  } else {
    console.log(`🔗 Connecting to database using individual parameters...`);
    pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "nonprofit",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "password",
    });
  }

  const db = drizzle(pool);

  try {
    console.log("🔄 Starting database import...\n");

    // Parse Excel file
    const excelPath = path.join(__dirname, "Eli-Lapsed Donors.xlsx");
    const donorRecords = parseExcel(excelPath);
    console.log(`✅ Parsed ${donorRecords.length} donor records\n`);

    // Start transaction
    console.log("🔄 Starting database transaction...");
    await pool.query("BEGIN");

    try {
      // Clean up existing data first
      await cleanupExistingData(db, organizationId);

      // 1. Check organization exists
      console.log("🏢 Checking organization...");
      const existingOrg = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

      if (existingOrg.length === 0) {
        console.log(`Creating organization with ID: ${organizationId}`);
        await db.insert(organizations).values({
          id: organizationId,
          name: "Eli's Organization",
          description: "Imported from Excel data",
          createdBy: "system",
        });
        console.log(`✅ Created organization: Eli's Organization`);
      } else {
        console.log(`✅ Using existing organization: ${existingOrg[0].name}`);
      }

      // Commit the organization creation/verification immediately
      await pool.query("COMMIT");
      await pool.query("BEGIN");

      // 2. Create General project
      console.log("📋 Creating General project...");
      const projectData: InsertProject = {
        organizationId,
        name: "General",
        description: "General donations project",
        active: true,
      };

      const [insertedProject] = await db.insert(projects).values(projectData).returning();
      console.log(`✅ Created General project with ID: ${insertedProject.id}`);

      // Commit the project creation immediately
      await pool.query("COMMIT");
      await pool.query("BEGIN");

      // 3. Create Eli staff member
      console.log("👨‍💼 Creating Eli staff member...");
      const staffData: InsertStaff = {
        organizationId,
        firstName: "Eli",
        lastName: "Staff",
        email: "eli@bbbschatt.org",
        isRealPerson: true,
      };

      const [insertedStaff] = await db.insert(staff).values(staffData).returning();
      console.log(`✅ Created staff member Eli with ID: ${insertedStaff.id}`);

      // Commit the staff creation immediately to ensure it's available
      await pool.query("COMMIT");
      await pool.query("BEGIN");

      // Verify staff was created by querying it
      const verifyStaff = await db.select().from(staff).where(eq(staff.id, insertedStaff.id)).limit(1);
      if (verifyStaff.length === 0) {
        throw new Error(`Staff member with ID ${insertedStaff.id} was not found after creation. Aborting import.`);
      }
      console.log(`✅ Verified staff member exists with ID: ${insertedStaff.id}`);

      // 4. Import donors and their donations
      console.log("👥 Importing donors and donations...");

      // Double-check that staff exists again before importing donors
      const staffMembers = await db.select().from(staff).where(eq(staff.organizationId, organizationId));
      console.log(`Found ${staffMembers.length} staff members for organization:`);
      staffMembers.forEach((s) => console.log(`  Staff ID: ${s.id}, Name: ${s.firstName} ${s.lastName}`));

      // Confirm that our staff ID is in the list
      const staffExists = staffMembers.some((s) => s.id === insertedStaff.id);
      if (!staffExists) {
        throw new Error(`Staff member with ID ${insertedStaff.id} not found in database. Cannot proceed with import.`);
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      // Track processed emails to handle duplicates
      const processedEmails = new Set<string>();

      // Process donors in smaller batches with individual transactions
      console.log(`Processing ${donorRecords.length} donors in individual transactions...`);

      for (let i = 0; i < donorRecords.length; i++) {
        const record = donorRecords[i];
        const email = record["Email"] || "";

        // Skip duplicate emails (keep only the first occurrence)
        if (email && processedEmails.has(email.toLowerCase())) {
          console.log(`Skipping duplicate email: ${email} for ${record["First Name"]} ${record["Last Name"]}`);
          skippedCount++;
          continue;
        }

        // Add email to processed set if it's not empty
        if (email) {
          processedEmails.add(email.toLowerCase());
        }

        // Start a new transaction for each donor
        await pool.query("BEGIN");

        try {
          console.log(
            `Processing donor ${i + 1}/${donorRecords.length}: ${record["First Name"]} ${record["Last Name"]}`
          );

          // Create donor without staff assignment initially
          const donorData: InsertDonor = {
            organizationId,
            firstName: record["First Name"] || "Unknown",
            lastName: record["Last Name"] || "Donor",
            displayName: record["Account Name"] || `${record["First Name"]} ${record["Last Name"]}`,
            email: record["Email"] || "",
            isCouple: false, // Assuming single donors from the data
            // Add address information for Chattanooga, TN
            address: "Chattanooga", // Default street address with city
            state: "TN", // Tennessee
            // Only include staff assignment if we're sure the staff member exists
            ...(staffExists ? { assignedToStaffId: insertedStaff.id } : {}),
          };

          const [insertedDonor] = await db.insert(donors).values(donorData).returning();

          // Create donation if there's a last gift amount
          if (record["Last Gift Amount"] && record["Last Gift Date"]) {
            // Log the values for debugging
            if (typeof record["Last Gift Amount"] !== "string" && typeof record["Last Gift Amount"] !== "number") {
              console.log(
                `Unusual gift amount type for ${record["First Name"]} ${record["Last Name"]}: ${typeof record[
                  "Last Gift Amount"
                ]}, value: ${record["Last Gift Amount"]}`
              );
            }

            // Debug the date parsing
            const parsedDate = parseDate(record["Last Gift Date"]);
            console.log(
              `Parsing date "${record["Last Gift Date"]}" resulted in: ${
                parsedDate ? parsedDate.toISOString() : "null"
              }`
            );

            // Always use the parsed date if available, otherwise use today's date (NOT 1970)
            const donationDate = parsedDate || new Date();

            const donationData: InsertDonation = {
              donorId: insertedDonor.id,
              projectId: insertedProject.id,
              amount: dollarsToCents(record["Last Gift Amount"]),
              date: donationDate,
              currency: "USD",
            };

            await db.insert(donations).values(donationData);
          }

          // Commit this donor's transaction
          await pool.query("COMMIT");

          successCount++;

          // Log progress periodically
          if (i % 10 === 0 || i === donorRecords.length - 1) {
            console.log(`Progress: ${i + 1}/${donorRecords.length} donors processed`);
          }
        } catch (error) {
          // Rollback this donor's transaction
          await pool.query("ROLLBACK");
          errorCount++;
          console.error(`Error importing donor ${record["First Name"]} ${record["Last Name"]}:`, error);
        }
      }

      console.log(`✅ Successfully imported ${successCount} donors`);
      if (errorCount > 0) {
        console.log(`⚠️ Failed to import ${errorCount} donors`);
      }
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} donors with duplicate emails`);
      }
      console.log(
        `📊 Summary: ${successCount} imported, ${errorCount} failed, ${skippedCount} skipped, ${donorRecords.length} total`
      );

      // Commit transaction
      await pool.query("COMMIT");
      console.log("✅ Database import completed successfully");
    } catch (error) {
      // Rollback transaction on error
      await pool.query("ROLLBACK");
      console.error("❌ Error during import, transaction rolled back:", error);
      throw error;
    } finally {
      // Always close the pool
      await pool.end();
    }
  } catch (error) {
    console.error("❌ Import failed:", error);
    throw error;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log("🚀 Starting Eli's lapsed donors import...");

  const organizationId = "org_2yMw8bMTvy9ZRUeAEe7FwK0AdaK";

  try {
    await importDataToDatabase(organizationId);
    console.log("✅ Import completed successfully");
  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

// Run the main function
main();
