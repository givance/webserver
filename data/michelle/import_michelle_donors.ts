import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { organizations, donors, donations, projects, staff } from "../../src/app/lib/db/schema.js";
import type { InferInsertModel } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";

dotenv.config();

// Define types for database insertions
type InsertDonor = InferInsertModel<typeof donors>;
type InsertDonation = InferInsertModel<typeof donations>;
type InsertProject = InferInsertModel<typeof projects>;
type InsertStaff = InferInsertModel<typeof staff>;

// Define interface for donor records from CSV
interface DonorRecord {
  "First Name": string;
  "Last Name": string;
  "Contact Type": string;
  Email: string;
  City: string;
  State: string;
  "Zip Code": string;
  "Total Gifts": string;
  "Last Gift Amount": string;
  "Last Activity": string;
  Campaign: string;
}

/**
 * Parse CSV file and return array of records
 * @param filePath Path to the CSV file
 * @returns Array of parsed records
 */
function parseCSV(filePath: string): DonorRecord[] {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Parse CSV with headers
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as DonorRecord[];

    console.log(`Parsed ${records.length} records from CSV file`);
    return records;
  } catch (error) {
    console.error(`Error parsing CSV file ${filePath}:`, error);
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
 * @param dateValue Date string or number from CSV
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

    // Handle MM/DD/YYYY format (with or without leading zeros)
    const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateMatch) {
      const [, month, day, year] = dateMatch;
      console.log(`Matched MM/DD/YYYY format: month=${month}, day=${day}, year=${year}`);
      // Month is 0-indexed in JavaScript Date
      const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

      // Verify the date is valid
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

    // Try parsing as a regular date string
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
 * Import data from CSV to database
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
    const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;
    pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: dbPort,
      database: process.env.DB_NAME || "nonprofit",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "password",
    });
  }

  const db = drizzle(pool);

  try {
    console.log("🔄 Starting database import...\n");

    // Parse CSV file
    const csvPath = path.join(__dirname, "Special_Project_Donor_and_Prospects.csv");
    const donorRecords = parseCSV(csvPath);
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
          name: "Michelle's Organization",
          description: "Imported from Special Project Donor and Prospects CSV data",
          createdBy: "system",
        });
        console.log(`✅ Created organization: Michelle's Organization`);
      } else {
        console.log(`✅ Using existing organization: ${existingOrg[0].name}`);
      }

      // Commit the organization creation/verification immediately
      await pool.query("COMMIT");
      await pool.query("BEGIN");

      // 2. Create projects based on Campaign field
      console.log("📋 Creating projects from campaigns...");
      const uniqueCampaigns = [...new Set(donorRecords.map((record) => record.Campaign).filter(Boolean))];
      const projectMap = new Map<string, number>();

      // Always create a General project
      const generalProjectData: InsertProject = {
        organizationId,
        name: "General",
        description: "General donations project",
        active: true,
      };

      const [generalProject] = await db.insert(projects).values(generalProjectData).returning();
      projectMap.set("General", generalProject.id);
      console.log(`✅ Created General project with ID: ${generalProject.id}`);

      // Create projects for each unique campaign
      for (const campaign of uniqueCampaigns) {
        if (campaign && campaign.trim() !== "") {
          const projectData: InsertProject = {
            organizationId,
            name: campaign,
            description: `Project for ${campaign} campaign`,
            active: true,
          };

          const [insertedProject] = await db.insert(projects).values(projectData).returning();
          projectMap.set(campaign, insertedProject.id);
          console.log(`✅ Created project "${campaign}" with ID: ${insertedProject.id}`);
        }
      }

      // Commit the project creation immediately
      await pool.query("COMMIT");
      await pool.query("BEGIN");

      // 3. Create Michelle staff member
      console.log("👩‍💼 Creating Michelle staff member...");
      const staffData: InsertStaff = {
        organizationId,
        firstName: "Michelle",
        lastName: "Staff",
        email: "michelle@organization.org",
        isRealPerson: true,
      };

      const [insertedStaff] = await db.insert(staff).values(staffData).returning();
      console.log(`✅ Created staff member Michelle with ID: ${insertedStaff.id}`);

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

          // Build address string from city, state, zip
          let address = "";
          if (record["City"]) {
            address = record["City"];
            if (record["State"]) {
              address += `, ${record["State"]}`;
            }
            if (record["Zip Code"]) {
              address += ` ${record["Zip Code"]}`;
            }
          }

          // Create donor
          const donorData: InsertDonor = {
            organizationId,
            firstName: record["First Name"] || "Unknown",
            lastName: record["Last Name"] || "Donor",
            displayName: `${record["First Name"]} ${record["Last Name"]}`.trim() || "Unknown Donor",
            email: record["Email"] || "",
            isCouple: false, // Assuming single donors from the data
            address: address || "Unknown",
            state: record["State"] || "",
            notes: record["Contact Type"] ? `Contact Type: ${record["Contact Type"]}` : "",
            // Assign to staff member
            assignedToStaffId: insertedStaff.id,
          };

          const [insertedDonor] = await db.insert(donors).values(donorData).returning();

          // Create donation if there's a last gift amount
          if (record["Last Gift Amount"]) {
            // Determine which project to use
            let projectId = generalProject.id; // Default to General
            if (record["Campaign"] && projectMap.has(record["Campaign"])) {
              projectId = projectMap.get(record["Campaign"])!;
            }

            // Parse the date from Last Activity
            const parsedDate = parseDate(record["Last Activity"]);
            // If no valid date, use a reasonable default (beginning of current year)
            const donationDate = parsedDate || new Date(new Date().getFullYear(), 0, 1);

            const donationData: InsertDonation = {
              donorId: insertedDonor.id,
              projectId: projectId,
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
  console.log("🚀 Starting Michelle's Special Project donors import...");

  const organizationId = "org_2yOVpgYJZpOthzWd0UUam7vxISA";

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
