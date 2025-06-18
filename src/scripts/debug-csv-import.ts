import * as fs from "fs";
import * as path from "path";
import { processCSVFiles } from "../app/lib/utils/csv-import";

async function debugCSVImport() {
  console.log("🔍 Starting CSV import debug...");

  try {
    // Read the CSV files
    const accountsPath = path.join(process.env.HOME!, "Downloads", "account.csv");
    const pledgesPath = path.join(process.env.HOME!, "Downloads", "pledge.csv");

    console.log(`📁 Reading accounts from: ${accountsPath}`);
    console.log(`📁 Reading pledges from: ${pledgesPath}`);

    if (!fs.existsSync(accountsPath)) {
      throw new Error(`Accounts file not found: ${accountsPath}`);
    }

    if (!fs.existsSync(pledgesPath)) {
      throw new Error(`Pledges file not found: ${pledgesPath}`);
    }

    const accountsCSV = fs.readFileSync(accountsPath, "utf8");
    const pledgesCSV = fs.readFileSync(pledgesPath, "utf8");

    console.log(`✅ Accounts CSV size: ${accountsCSV.length} bytes`);
    console.log(`✅ Pledges CSV size: ${pledgesCSV.length} bytes`);

    // Parse just the first few lines to check for duplicate emails
    const lines = accountsCSV.split("\n");
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const emailIndex = headers.findIndex((h) => h === "Email");

    console.log(`📋 Headers: ${headers.join(", ")}`);
    console.log(`📧 Email column index: ${emailIndex}`);

    if (emailIndex === -1) {
      throw new Error("Email column not found in CSV");
    }

    // Check for duplicate emails in the CSV
    const emails = [];
    const emailCounts = new Map<string, number>();

    for (let i = 1; i < Math.min(lines.length, 50); i++) {
      // Check first 50 records
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",");
      if (values.length > emailIndex) {
        const email = values[emailIndex].replace(/"/g, "").trim().toLowerCase();
        if (email) {
          emails.push(email);
          emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
        }
      }
    }

    console.log(`📊 Found ${emails.length} non-empty emails in first 50 records`);

    // Find duplicates
    const duplicates = Array.from(emailCounts.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log("🚨 DUPLICATE EMAILS FOUND IN CSV:");
      duplicates.forEach(([email, count]) => {
        console.log(`   "${email}": ${count} times`);
      });
    } else {
      console.log("✅ No duplicate emails found in first 50 records");
    }

    // First create or find a test list
    const { db } = await import("../app/lib/db");
    const { donorLists } = await import("../app/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");

    // Try to find existing test list first
    const existingLists = await db
      .select()
      .from(donorLists)
      .where(
        and(eq(donorLists.organizationId, "org_2xkwJSFwV6rBg4e34KJiu5U8F7U"), eq(donorLists.name, "Debug Test Import"))
      )
      .limit(1);

    let testList;
    if (existingLists.length > 0) {
      testList = existingLists[0];
      console.log(`📋 Using existing test list with ID: ${testList.id}`);
    } else {
      [testList] = await db
        .insert(donorLists)
        .values({
          organizationId: "org_2xkwJSFwV6rBg4e34KJiu5U8F7U",
          name: "Debug Test Import",
          description: "Test list for debugging CSV import",
        })
        .returning();
      console.log(`📋 Created new test list with ID: ${testList.id}`);
    }

    // Now try the actual import
    const params = {
      accountsCSV,
      pledgesCSV,
      organizationId: "org_2xkwJSFwV6rBg4e34KJiu5U8F7U",
      listId: testList.id,
      userId: "user_2xQMSFOEDvToWcElaeGJkETVvE4", // Use real user ID
    };

    console.log("🚀 Starting CSV processing...");
    const result = await processCSVFiles(params);

    console.log("✅ Import completed successfully!");
    console.log("📊 Results:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Import failed:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error("📋 Stack trace:", error.stack);
    }
  }
}

// Run the debug
debugCSVImport().catch(console.error);
