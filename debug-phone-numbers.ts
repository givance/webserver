import "dotenv/config";
import { db } from "./src/app/lib/db";
import { donors } from "./src/app/lib/db/schema";
import { eq } from "drizzle-orm";

async function debugPhoneNumbers() {
  try {
    // Replace with your actual organization ID from the error
    const organizationId = "org_2rmLZBEzLb1OOwJJJjZLQWxJqHo";
    
    // Get all donors for the organization
    const allDonors = await db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        phone: donors.phone,
      })
      .from(donors)
      .where(eq(donors.organizationId, organizationId))
      .orderBy(donors.id);
    
    console.log(`Total donors found: ${allDonors.length}`);
    
    // Check indices 10 and 11
    if (allDonors.length > 11) {
      console.log("\nDonor at index 10:");
      console.log(JSON.stringify(allDonors[10], null, 2));
      
      console.log("\nDonor at index 11:");
      console.log(JSON.stringify(allDonors[11], null, 2));
      
      // Test the regex on these phone numbers
      const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
      
      console.log("\nPhone validation results:");
      if (allDonors[10].phone) {
        console.log(`Index 10 phone: "${allDonors[10].phone}" - Valid: ${phoneRegex.test(allDonors[10].phone)}`);
      }
      if (allDonors[11].phone) {
        console.log(`Index 11 phone: "${allDonors[11].phone}" - Valid: ${phoneRegex.test(allDonors[11].phone)}`);
      }
      
      // Check all phone numbers for invalid formats
      console.log("\nAll invalid phone numbers:");
      allDonors.forEach((donor, index) => {
        if (donor.phone && !phoneRegex.test(donor.phone)) {
          console.log(`Index ${index} (ID: ${donor.id}): "${donor.phone}"`);
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugPhoneNumbers();