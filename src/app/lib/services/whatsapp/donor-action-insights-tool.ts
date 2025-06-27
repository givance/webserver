import { z } from "zod";
import { logger } from "@/app/lib/logger";
import { db } from "@/app/lib/db";
import { donors, donations, communicationContent, projects, staff } from "@/app/lib/db/schema";
import { eq, and, desc, sql, gte, lte, isNull, isNotNull, or } from "drizzle-orm";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { env } from "@/app/lib/env";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

/**
 * Interface for donor action insights
 */
interface DonorActionInsight {
  donorId: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  assignedStaffName: string | null;
  currentStage: string | null;
  totalDonated: number;
  donationCount: number;
  lastDonationDate: Date | null;
  firstDonationDate: Date | null;
  lastCommunicationDate: Date | null;
  averageDonationAmount: number;
  monthsSinceLastDonation: number | null;
  donationPattern: {
    monthlyDistribution: Record<string, number>;
    avgTimeBetweenDonations: number | null;
  };
  riskFactors: string[];
  actionPriority: "high" | "medium" | "low";
}

/**
 * Get current date information for seasonal analysis
 */
function getCurrentDateInfo() {
  const now = new Date();
  return {
    currentMonth: now.getMonth() + 1, // 1-12
    currentYear: now.getFullYear(),
    threeMonthsAgo: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
    sixMonthsAgo: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
    oneYearAgo: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    twoYearsAgo: new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()),
  };
}

/**
 * Fetch comprehensive donor insights for action analysis
 */
async function fetchDonorActionInsights(organizationId: string): Promise<DonorActionInsight[]> {
  const dateInfo = getCurrentDateInfo();

  // Complex query to get all donor data with aggregated donation and communication info
  const donorData = await db
    .select({
      donorId: donors.id,
      firstName: donors.firstName,
      lastName: donors.lastName,
      displayName: donors.displayName,
      email: donors.email,
      currentStage: donors.currentStageName,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      totalDonated: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
      donationCount: sql<number>`COUNT(${donations.id})`,
      lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
      firstDonationDate: sql<Date | null>`MIN(${donations.date})`,
      avgDonationAmount: sql<number>`CASE WHEN COUNT(${donations.id}) > 0 THEN AVG(${donations.amount}) ELSE 0 END`,
      donationMonths: sql<
        string[]
      >`ARRAY_AGG(DISTINCT EXTRACT(month FROM ${donations.date})) FILTER (WHERE ${donations.date} IS NOT NULL)`,
    })
    .from(donors)
    .leftJoin(donations, eq(donors.id, donations.donorId))
    .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
    .where(eq(donors.organizationId, organizationId))
    .groupBy(
      donors.id,
      donors.firstName,
      donors.lastName,
      donors.displayName,
      donors.email,
      donors.currentStageName,
      staff.firstName,
      staff.lastName
    );

  // Get last communication dates separately for better performance
  const communicationData = await db
    .select({
      donorId: communicationContent.fromDonorId,
      lastCommunicationDate: sql<Date | null>`MAX(${communicationContent.datetime})`,
    })
    .from(communicationContent)
    .where(isNotNull(communicationContent.fromDonorId))
    .groupBy(communicationContent.fromDonorId);

  const communicationMap = new Map(communicationData.map((c) => [c.donorId, c.lastCommunicationDate]));

  // Process and enrich donor data
  const insights: DonorActionInsight[] = donorData.map((donor) => {
    const lastCommunicationDate = communicationMap.get(donor.donorId) || null;
    const monthsSinceLastDonation = donor.lastDonationDate
      ? Math.floor((Date.now() - donor.lastDonationDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : null;

    // Calculate donation pattern
    const monthlyDistribution: Record<string, number> = {};
    if (donor.donationMonths && Array.isArray(donor.donationMonths)) {
      donor.donationMonths.forEach((month) => {
        if (month && typeof month === "number") {
          const monthName = new Date(2000, month - 1, 1).toLocaleString("default", { month: "long" });
          monthlyDistribution[monthName] = (monthlyDistribution[monthName] || 0) + 1;
        }
      });
    }

    // Calculate average time between donations
    let avgTimeBetweenDonations: number | null = null;
    if (donor.firstDonationDate && donor.lastDonationDate && donor.donationCount > 1) {
      const timeDiff = donor.lastDonationDate.getTime() - donor.firstDonationDate.getTime();
      avgTimeBetweenDonations = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 30) / (donor.donationCount - 1));
    }

    // Assess risk factors
    const riskFactors: string[] = [];
    if (monthsSinceLastDonation && monthsSinceLastDonation > 12) {
      riskFactors.push("No donation in over 12 months");
    } else if (monthsSinceLastDonation && monthsSinceLastDonation > 6) {
      riskFactors.push("No donation in over 6 months");
    }

    if (!lastCommunicationDate || Date.now() - lastCommunicationDate.getTime() > 90 * 24 * 60 * 60 * 1000) {
      riskFactors.push("No recent communication");
    }

    if (donor.donationCount === 1 && monthsSinceLastDonation && monthsSinceLastDonation > 3) {
      riskFactors.push("Single donation, no follow-up");
    }

    if (!donor.currentStage) {
      riskFactors.push("No defined donor journey stage");
    }

    // Determine action priority
    let actionPriority: "high" | "medium" | "low" = "low";
    if (riskFactors.length >= 3 || (donor.totalDonated > 50000 && riskFactors.length > 0)) {
      actionPriority = "high";
    } else if (riskFactors.length >= 2 || donor.totalDonated > 10000) {
      actionPriority = "medium";
    }

    return {
      donorId: donor.donorId,
      firstName: donor.firstName,
      lastName: donor.lastName,
      displayName: donor.displayName,
      email: donor.email,
      assignedStaffName:
        donor.staffFirstName && donor.staffLastName ? `${donor.staffFirstName} ${donor.staffLastName}` : null,
      currentStage: donor.currentStage,
      totalDonated: donor.totalDonated,
      donationCount: donor.donationCount,
      lastDonationDate: donor.lastDonationDate,
      firstDonationDate: donor.firstDonationDate,
      lastCommunicationDate,
      averageDonationAmount: donor.avgDonationAmount,
      monthsSinceLastDonation,
      donationPattern: {
        monthlyDistribution,
        avgTimeBetweenDonations,
      },
      riskFactors,
      actionPriority,
    };
  });

  return insights;
}

/**
 * Create the donor action insights AI tool
 */
export function createDonorActionInsightsTool(
  organizationId: string,
  loggingService?: any,
  staffId?: number,
  fromPhoneNumber?: string
) {
  return {
    analyzeActionNeeded: {
      description: `Analyze donor data to identify donors who need immediate attention and provide actionable insights.
      
This tool examines all donors in the organization to identify:
1. Donors at risk of lapsing (haven't donated recently)
2. Donors who typically give at this time of year (seasonal patterns)
3. Donors who need follow-up communication
4. High-value donors requiring special attention

The analysis considers donation history, communication patterns, donor journey stages, and seasonal giving trends to provide prioritized action recommendations.`,

      parameters: z.object({
        analysisType: z
          .enum([
            "comprehensive", // Full analysis of all action items
            "lapse_risk", // Focus on donors at risk of lapsing
            "seasonal_opportunities", // Focus on seasonal giving patterns
            "communication_gaps", // Focus on communication follow-ups
            "high_value_attention", // Focus on high-value donors needing attention
          ])
          .default("comprehensive")
          .describe("Type of analysis to perform"),

        maxResults: z.number().optional().default(50).describe("Maximum number of donors to analyze and report on"),

        priorityLevel: z
          .enum(["all", "high", "medium", "low"])
          .optional()
          .default("all")
          .describe("Filter by action priority level"),
      }),

      execute: async (params: {
        analysisType:
          | "comprehensive"
          | "lapse_risk"
          | "seasonal_opportunities"
          | "communication_gaps"
          | "high_value_attention";
        maxResults?: number;
        priorityLevel?: "all" | "high" | "medium" | "low";
      }) => {
        const { analysisType, maxResults = 50, priorityLevel = "all" } = params;

        logger.info(`[WhatsApp AI] Starting donor action insights analysis`, {
          analysisType,
          maxResults,
          priorityLevel,
          organizationId,
        });

        try {
          const startTime = Date.now();

          // Fetch comprehensive donor insights
          const donorInsights = await fetchDonorActionInsights(organizationId);
          const fetchTime = Date.now() - startTime;

          logger.info(`[WhatsApp AI] Fetched insights for ${donorInsights.length} donors in ${fetchTime}ms`);

          // Filter based on priority level
          let filteredInsights = donorInsights;
          if (priorityLevel !== "all") {
            filteredInsights = donorInsights.filter((insight) => insight.actionPriority === priorityLevel);
          }

          // Sort by priority and total donated (high value donors first)
          filteredInsights.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            const priorityDiff = priorityOrder[b.actionPriority] - priorityOrder[a.actionPriority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.totalDonated - a.totalDonated;
          });

          // Limit results
          const limitedInsights = filteredInsights.slice(0, maxResults);

          // Prepare data for AI analysis
          const dateInfo = getCurrentDateInfo();
          const analysisData = {
            currentDate: new Date().toISOString(),
            currentMonth: dateInfo.currentMonth,
            currentYear: dateInfo.currentYear,
            totalDonorsAnalyzed: donorInsights.length,
            filteredDonorsCount: limitedInsights.length,
            analysisType,
            priorityLevel,
            donorInsights: limitedInsights.map((insight) => ({
              ...insight,
              // Format amounts in dollars for AI readability
              totalDonatedFormatted: `$${(insight.totalDonated / 100).toFixed(2)}`,
              averageDonationFormatted: `$${(insight.averageDonationAmount / 100).toFixed(2)}`,
              lastDonationFormatted: insight.lastDonationDate?.toLocaleDateString() || "Never",
              lastCommunicationFormatted: insight.lastCommunicationDate?.toLocaleDateString() || "Never",
            })),
          };

          // Create AI prompt based on analysis type
          const systemPrompt = `You are an AI assistant specialized in nonprofit donor relationship management. 
            Analyze the provided donor data to identify actionable insights and prioritized recommendations.
            
            Current date: ${new Date().toLocaleDateString()}
            Current month: ${new Date().toLocaleString("default", { month: "long" })}
            
            Focus on providing specific, actionable recommendations with clear reasoning.`;

          let userPrompt = "";

          switch (analysisType) {
            case "lapse_risk":
              userPrompt = `Analyze the donor data to identify donors at highest risk of lapsing. Focus on:
              - Donors who haven't given in 6+ months but have a history of regular giving
              - Previous consistent donors showing signs of disengagement
              - Specific actions to re-engage at-risk donors
              
              Provide prioritized recommendations for preventing donor lapse.`;
              break;

            case "seasonal_opportunities":
              userPrompt = `Analyze donation patterns to identify seasonal giving opportunities. Focus on:
              - Donors who typically give during this time of year (${new Date().toLocaleString("default", {
                month: "long",
              })})
              - Historical seasonal giving patterns that suggest outreach timing
              - Donors whose giving patterns suggest they're due for a donation soon
              
              Provide recommendations for seasonal outreach and timing.`;
              break;

            case "communication_gaps":
              userPrompt = `Identify donors who need communication follow-up. Focus on:
              - Donors with no recent communication despite being active
              - New donors (single donation) who haven't been properly cultivated
              - High-value donors who may feel neglected
              
              Provide specific communication strategies and priorities.`;
              break;

            case "high_value_attention":
              userPrompt = `Focus on high-value donors requiring special attention. Identify:
              - Major donors showing concerning patterns (reduced giving, no communication)
              - Donors with high potential who need cultivation
              - VIP donors who should receive personalized attention
              
              Provide tailored strategies for major donor stewardship.`;
              break;

            default: // comprehensive
              userPrompt = `Provide a comprehensive analysis of donor action items across all categories:
              1. Donors at risk of lapsing and how to re-engage them
              2. Seasonal giving opportunities for this time of year
              3. Communication gaps that need addressing
              4. High-value donors requiring special attention
              
              Prioritize the most critical actions and provide specific next steps.`;
          }

          userPrompt += `\n\nDonor Data:\n${JSON.stringify(analysisData, null, 2)}`;

          // Generate AI analysis
          const llmStartTime = Date.now();
          const result = await generateText({
            model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
            maxTokens: 3000,
          });
          const llmTime = Date.now() - llmStartTime;

          const totalTime = Date.now() - startTime;

          logger.info(`[WhatsApp AI] Donor action insights analysis completed`, {
            analysisType,
            donorsAnalyzed: donorInsights.length,
            filteredResults: limitedInsights.length,
            tokensUsed: result.usage?.totalTokens || 0,
            llmTimeMs: llmTime,
            totalTimeMs: totalTime,
          });

          // Log the analysis execution if logging service is available
          if (loggingService && staffId && fromPhoneNumber) {
            await loggingService.logActivity({
              staffId,
              organizationId,
              activityType: "donor_action_insights_analysis",
              phoneNumber: fromPhoneNumber,
              summary: `Analyzed ${donorInsights.length} donors for ${analysisType} insights`,
              data: {
                analysisType,
                donorsAnalyzed: donorInsights.length,
                filteredResults: limitedInsights.length,
                priorityLevel,
                maxResults,
                analysisResult: result.text,
                tokensUsed: result.usage?.totalTokens || 0,
                timestamp: new Date(),
              },
              metadata: {
                donorsAnalyzed: donorInsights.length,
                filteredResults: limitedInsights.length,
                tokensUsed: result.usage?.totalTokens || 0,
                analysisType,
                priorityLevel,
                processingTimeMs: totalTime,
                efficiency:
                  (result.usage?.totalTokens || 0) > 0 ? result.text.length / (result.usage?.totalTokens || 1) : 0,
              },
            });
          }

          return {
            success: true,
            analysis: result.text,
            summary: {
              totalDonorsAnalyzed: donorInsights.length,
              donorsInResults: limitedInsights.length,
              analysisType,
              priorityBreakdown: {
                high: donorInsights.filter((d) => d.actionPriority === "high").length,
                medium: donorInsights.filter((d) => d.actionPriority === "medium").length,
                low: donorInsights.filter((d) => d.actionPriority === "low").length,
              },
              processingTimeMs: totalTime,
            },
            tokensUsed: result.usage?.totalTokens || 0,
          };
        } catch (error) {
          logger.error(`[WhatsApp AI] Error in donor action insights analysis:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred during analysis",
          };
        }
      },
    },
  };
}
