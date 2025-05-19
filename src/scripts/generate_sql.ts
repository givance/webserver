#!/usr/bin/env tsx

import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import {
  staff,
  donors,
  communicationThreads,
  communicationContent,
  communicationThreadStaff,
  communicationThreadDonors,
  communicationChannelEnum,
} from "../app/lib/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface ContactLogEntry {
  CNT_ID: string;
  ACT_ID: string;
  SystemDisplay1: string;
  CNT_DateTime: string;
  CNT_Type: string;
  USR_ID: string;
  USR_Code: string;
  USR_LastName: string;
  USR_FirstName: string;
  CNT_Detail: string;
  CNT_Notes: string;
}

interface ProcessStats {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

function mapStaffId(usrId: string, usrCode: string): string {
  // Map CSV staff IDs to database staff IDs
  const staffMap: { [key: string]: string } = {
    "48": "bbberman@bezri.org", // Boruch Berman
    "64": "elevin@bezri.org", // Elya Levin
    "71": "elevin@bezri.org", // AFYETM maps to Elya Levin
    "80": "elevin@bezri.org", // GenerosityBuilders maps to Elya Levin
  };

  return staffMap[usrId] || usrCode + "@bezri.org";
}

function parseDonorName(systemDisplay1: string): { firstName: string; lastName: string; email?: string } {
  // Handle special cases and different formats
  if (systemDisplay1.includes(",")) {
    let [lastName, firstNamePart] = systemDisplay1.split(",").map((s) => s.trim());

    // Handle special cases
    if (lastName === "THE APPLEBAUM FOUNDATION") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "applebaumfoundation@gmail.com",
      };
    }

    if (lastName === "SANDERLING RENAL SERVICES, INC.") {
      // Get the actual person's name from the second part
      const [personLastName, personFirstName] = firstNamePart.split(",").map((s) => s.trim());
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "jst@sanderlingllc.com",
      };
    }

    if (lastName === "YOUNG ISRAEL OF NEW ROCHELLE") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "yish4i@gmail.com",
      };
    }

    if (lastName === "FINK") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "rcweiss1@gmail.com",
      };
    }

    if (lastName === "KLUG") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "noahklug@gmail.com",
      };
    }

    if (lastName === "ELY") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "mely@elyfund.com",
      };
    }

    if (lastName === "EHRENPREIS") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "deborabergwerk@gmail.com",
      };
    }

    if (lastName === "REICHNER") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "elizabethalex123@aol.com",
      };
    }

    if (lastName === "WEISS") {
      return {
        firstName: "FirstName",
        lastName: "LastName",
        email: "rcweiss1@gmail.com",
      };
    }

    // Handle "LastName, FirstName and SpouseName" format
    if (firstNamePart && firstNamePart.includes(" and ")) {
      firstNamePart = firstNamePart.split(" and ")[0];
    }

    // Clean up organization names
    lastName = lastName
      .replace(/^THE /, "")
      .replace(/ FOUNDATION$/, "")
      .replace(/ INC\.$/, "")
      .replace(/ OF NEW ROCHELLE$/, "")
      .replace(/ AND FAMILY$/, "");

    return {
      firstName: firstNamePart || "FirstName",
      lastName,
    };
  }

  // Handle non-comma cases (should be rare)
  const parts = systemDisplay1.split(" ");
  return {
    firstName: parts[0] || "FirstName",
    lastName: parts.slice(1).join(" ") || systemDisplay1,
  };
}

async function processCommunicationLog(organizationId: string): Promise<ProcessStats> {
  const stats: ProcessStats = {
    total: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  console.log("Starting communication log processing...");

  // Validate environment variables
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  try {
    // Read and parse CSV file
    const csvFilePath = path.join(process.cwd(), "data", "Contact Log for AI project.csv");
    console.log(`Reading CSV file from: ${csvFilePath}`);

    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found at: ${csvFilePath}`);
    }

    const csvContent = fs.readFileSync(csvFilePath, "utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    }) as ContactLogEntry[];

    stats.total = records.length;
    console.log(`Found ${records.length} records to process`);

    // Initialize database connection
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const db = drizzle(pool);

    // Clean up previous communication data
    console.log("Cleaning up previous communication data...");
    await db.delete(communicationContent);
    await db.delete(communicationThreadDonors);
    await db.delete(communicationThreadStaff);
    await db.delete(communicationThreads);
    console.log("Previous communication data cleared successfully");

    // Cache staff members to avoid repeated lookups
    const staffMembers = await db.select().from(staff).where(eq(staff.organizationId, organizationId));
    const staffMap = new Map(staffMembers.map((s) => [s.email.toLowerCase(), s]));

    // Cache donors to avoid repeated lookups
    const donorsList = await db.select().from(donors).where(eq(donors.organizationId, organizationId));

    // Process each record
    for (const record of records) {
      try {
        console.log(`Processing record ${record.CNT_ID} for ${record.SystemDisplay1}`);

        // 1. Find staff member by mapped email
        const staffEmail = mapStaffId(record.USR_ID, record.USR_Code);
        const staffMember = staffMembers.find((s) => s.email.toLowerCase() === staffEmail.toLowerCase());

        if (!staffMember) {
          throw new Error(`Staff not found: ${staffEmail}`);
        }

        // 2. Find donor by name
        const { firstName, lastName, email } = parseDonorName(record.SystemDisplay1);
        const donor = donorsList.find((d) => {
          // If we have a specific email match from special cases, use that
          if (email && d.email.toLowerCase() === email.toLowerCase()) {
            return true;
          }

          const dFirstName = d.firstName.toLowerCase();
          const dLastName = d.lastName.toLowerCase();
          const searchFirstName = firstName.toLowerCase();
          const searchLastName = lastName.toLowerCase();

          // Try exact match first
          if (dFirstName === searchFirstName && dLastName === searchLastName) {
            return true;
          }

          // Try matching just the last name for organizations
          if (firstName === "FirstName" && dLastName === searchLastName) {
            return true;
          }

          // Try matching just the first word of multi-word last names
          const dLastNameFirst = dLastName.split(" ")[0];
          const searchLastNameFirst = searchLastName.split(" ")[0];
          if (dFirstName === searchFirstName && dLastNameFirst === searchLastNameFirst) {
            return true;
          }

          // Try matching with case-insensitive contains for last names
          if (
            dFirstName === searchFirstName &&
            (dLastName.includes(searchLastName) || searchLastName.includes(dLastName))
          ) {
            return true;
          }

          // Try matching with case-insensitive contains for first names
          if (
            dLastName === searchLastName &&
            (dFirstName.includes(searchFirstName) || searchFirstName.includes(dFirstName))
          ) {
            return true;
          }

          // Try matching with case-insensitive contains for both names
          if (
            (dFirstName.includes(searchFirstName) || searchFirstName.includes(dFirstName)) &&
            (dLastName.includes(searchLastName) || searchLastName.includes(dLastName))
          ) {
            return true;
          }

          return false;
        });

        if (!donor) {
          throw new Error(`Donor not found: ${record.SystemDisplay1} (parsed as ${firstName} ${lastName})`);
        }

        // 3. Create communication thread
        const [thread] = await db
          .insert(communicationThreads)
          .values({
            channel: mapCommunicationType(record.CNT_Type),
            externalId: record.CNT_ID,
          })
          .returning();

        // 4. Create thread associations
        await db.insert(communicationThreadStaff).values({
          threadId: thread.id,
          staffId: staffMember.id,
        });

        await db.insert(communicationThreadDonors).values({
          threadId: thread.id,
          donorId: donor.id,
        });

        // 5. Create communication content
        await db.insert(communicationContent).values({
          threadId: thread.id,
          content: `${record.CNT_Detail}\n${record.CNT_Notes}`.trim(),
          datetime: new Date(record.CNT_DateTime),
          fromStaffId: staffMember.id,
          toDonorId: donor.id,
          externalId: record.CNT_ID,
        });

        stats.successful++;
        console.log(`Successfully processed record ${record.CNT_ID}`);
      } catch (error) {
        stats.failed++;
        stats.errors.push({
          id: record.CNT_ID || "unknown",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(`Error processing record ${record.CNT_ID}:`, error);
      }
    }

    await pool.end();
    console.log("Database connection closed");

    // Print final statistics
    console.log("\nProcessing completed:");
    console.log(`Total records: ${stats.total}`);
    console.log(`Successfully processed: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    if (stats.failed > 0) {
      console.log("\nErrors:");
      stats.errors.forEach((error) => {
        console.log(`Record ${error.id}: ${error.error}`);
      });
    }

    return stats;
  } catch (error) {
    console.error("Fatal error:", error);
    throw error;
  }
}

function mapCommunicationType(cntType: string): "email" | "phone" | "text" {
  const typeMap: { [key: string]: "email" | "phone" | "text" } = {
    "FR Email (Outgoing)": "email",
    "FR Email (Incoming)": "email",
    "FR Call": "phone",
    "TM PHONE": "phone",
    "TM PHONE No Answer": "phone",
  };

  return typeMap[cntType] || "phone";
}

// Run the script if it's called directly
if (require.main === module) {
  const organizationId = process.argv[2];
  if (!organizationId) {
    console.error("Please provide an organization ID as a command line argument");
    process.exit(1);
  }

  processCommunicationLog(organizationId)
    .then(() => {
      console.log("Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}

export { processCommunicationLog };
