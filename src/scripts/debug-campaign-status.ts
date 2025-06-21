import { db } from "../app/lib/db";
import { emailGenerationSessions, generatedEmails } from "../app/lib/db/schema";
import { and, eq, count, sql } from "drizzle-orm";
import { EmailCampaignsService } from "../app/lib/services/email-campaigns.service";

/**
 * Debug script to diagnose campaign status issues
 * Run this to check the current state of campaigns and fix stuck ones
 */
async function debugCampaignStatus(organizationId: string) {
  console.log("\n=== Campaign Status Debug ===\n");

  try {
    // Get all campaigns for the organization
    const campaigns = await db
      .select({
        id: emailGenerationSessions.id,
        jobName: emailGenerationSessions.jobName,
        status: emailGenerationSessions.status,
        totalDonors: emailGenerationSessions.totalDonors,
        completedDonors: emailGenerationSessions.completedDonors,
        createdAt: emailGenerationSessions.createdAt,
        updatedAt: emailGenerationSessions.updatedAt,
      })
      .from(emailGenerationSessions)
      .where(eq(emailGenerationSessions.organizationId, organizationId))
      .orderBy(emailGenerationSessions.createdAt);

    console.log(`Found ${campaigns.length} campaigns for organization ${organizationId}\n`);

    // Check each campaign in detail
    for (const campaign of campaigns) {
      console.log(`--- Campaign ${campaign.id}: "${campaign.jobName}" ---`);
      console.log(`Status: ${campaign.status}`);
      console.log(`Total Donors: ${campaign.totalDonors}`);
      console.log(`Completed Donors: ${campaign.completedDonors}`);
      console.log(`Created: ${campaign.createdAt.toISOString()}`);
      console.log(`Updated: ${campaign.updatedAt.toISOString()}`);

      // Get email statistics for this campaign
      const [emailStats] = await db
        .select({
          totalEmails: count(),
          sentEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END)`,
          approvedEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.status} = 'APPROVED' THEN 1 END)`,
          pendingEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.status} = 'PENDING_APPROVAL' THEN 1 END)`,
        })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, campaign.id));

      console.log(`Total Emails: ${emailStats.totalEmails}`);
      console.log(`Approved Emails: ${emailStats.approvedEmails}`);
      console.log(`Pending Emails: ${emailStats.pendingEmails}`);
      console.log(`Sent Emails: ${emailStats.sentEmails}`);

      // Analyze potential issues
      const issues = [];

      if (campaign.status === "DRAFT" && emailStats.totalEmails > 0) {
        issues.push("❌ Campaign is in DRAFT status but has generated emails");
      }

      if (campaign.status === "PENDING" && emailStats.approvedEmails > 0) {
        issues.push("❌ Campaign is stuck in PENDING but has approved emails");
      }

      if (campaign.status === "PENDING" && emailStats.approvedEmails === campaign.totalDonors) {
        issues.push("🔧 Campaign should be IN_PROGRESS (all emails generated)");
      }

      if (campaign.completedDonors !== emailStats.approvedEmails) {
        issues.push(
          `🔧 completedDonors (${campaign.completedDonors}) doesn't match approvedEmails (${emailStats.approvedEmails})`
        );
      }

      if (issues.length > 0) {
        console.log("🚨 Issues found:");
        issues.forEach((issue) => console.log(`  ${issue}`));
      } else {
        console.log("✅ Campaign status appears correct");
      }

      console.log("");
    }

    // Try to fix stuck campaigns
    console.log("\n=== Attempting to Fix Stuck Campaigns ===\n");

    const campaignsService = new EmailCampaignsService();
    const fixResult = await campaignsService.fixStuckCampaigns(organizationId);

    console.log(`Fix Result:`, fixResult);

    console.log("\n=== Debug Complete ===\n");
  } catch (error) {
    console.error("Debug failed:", error);
    throw error;
  }
}

// Export for use in other scripts or direct execution
export { debugCampaignStatus };

// If run directly
if (require.main === module) {
  const organizationId = process.argv[2];

  if (!organizationId) {
    console.error("Usage: tsx src/scripts/debug-campaign-status.ts <organizationId>");
    process.exit(1);
  }

  debugCampaignStatus(organizationId)
    .then(() => {
      console.log("Debug completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Debug failed:", error);
      process.exit(1);
    });
}
