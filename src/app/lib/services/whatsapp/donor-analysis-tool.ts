import { z } from "zod";
import { logger } from "@/app/lib/logger";
import { db } from "@/app/lib/db";
import { donors, donations, communicationContent, todos, personResearch, projects, communicationThreads } from "@/app/lib/db/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { env } from "@/app/lib/env";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

/**
 * Interface for donor history data
 */
interface DonorHistory {
  donor: {
    id: number;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    state: string | null;
    isCouple: boolean;
    hisFirstName: string | null;
    hisLastName: string | null;
    herFirstName: string | null;
    herLastName: string | null;
    notes: string | Array<{ createdAt: string; createdBy: string; content: string }> | null;
    currentStageName: string | null;
    highPotentialDonor: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  };
  donations: Array<{
    id: number;
    amount: number;
    currency: string;
    date: Date;
    projectName: string;
  }>;
  communications: Array<{
    id: number;
    content: string;
    datetime: Date;
    channel: string;
    direction: "sent" | "received";
  }>;
  research: {
    researchTopic: string;
    researchData: any; // JSON data containing answer, citations, summaries, etc.
    isLive: boolean;
    version: number;
    updatedAt: Date;
  } | null;
  todos: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: Date | null;
  }>;
  totalDonated: number;
  donationCount: number;
  lastDonationDate: Date | null;
  firstDonationDate: Date | null;
}

/**
 * Fetch complete donor history including donations, notes, communications, research, and todos
 */
async function fetchDonorHistory(donorId: number, organizationId: string): Promise<DonorHistory | null> {
  try {
    // Fetch donor with stats
    const donorResult = await db
      .select({
        donor: donors,
        totalDonated: sql<number>`COALESCE(SUM(${donations.amount}), 0)::int`,
        donationCount: sql<number>`COUNT(DISTINCT ${donations.id})::int`,
        lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
        firstDonationDate: sql<Date | null>`MIN(${donations.date})`,
      })
      .from(donors)
      .leftJoin(donations, eq(donors.id, donations.donorId))
      .where(and(eq(donors.id, donorId), eq(donors.organizationId, organizationId)))
      .groupBy(donors.id);

    if (!donorResult[0]) {
      return null;
    }

    const { donor, totalDonated, donationCount, lastDonationDate, firstDonationDate } = donorResult[0];

    // Fetch donations with project details
    const donationsData = await db
      .select({
        id: donations.id,
        amount: donations.amount,
        currency: donations.currency,
        date: donations.date,
        projectName: sql<string>`(SELECT name FROM projects WHERE id = ${donations.projectId})`,
      })
      .from(donations)
      .where(eq(donations.donorId, donorId))
      .orderBy(desc(donations.date));


    // Fetch communications (both sent and received)
    const communicationsData = await db
      .select({
        id: communicationContent.id,
        content: communicationContent.content,
        datetime: communicationContent.datetime,
        channel: sql<string>`(SELECT channel FROM communication_threads WHERE id = ${communicationContent.threadId})`,
        direction: sql<"sent" | "received">`
          CASE 
            WHEN ${communicationContent.fromDonorId} = ${donorId} THEN 'sent'
            ELSE 'received'
          END
        `,
      })
      .from(communicationContent)
      .where(
        or(
          eq(communicationContent.fromDonorId, donorId),
          eq(communicationContent.toDonorId, donorId)
        )
      )
      .orderBy(desc(communicationContent.datetime));

    // Fetch person research (get live research or most recent)
    const researchData = await db
      .select({
        researchTopic: personResearch.researchTopic,
        researchData: personResearch.researchData,
        isLive: personResearch.isLive,
        version: personResearch.version,
        updatedAt: personResearch.updatedAt,
      })
      .from(personResearch)
      .where(
        and(
          eq(personResearch.donorId, donorId),
          eq(personResearch.organizationId, organizationId)
        )
      )
      .orderBy(desc(personResearch.isLive), desc(personResearch.updatedAt))
      .limit(1);

    // Fetch todos
    const todosData = await db
      .select({
        id: todos.id,
        title: todos.title,
        description: todos.description,
        status: todos.status,
        priority: todos.priority,
        dueDate: todos.dueDate,
      })
      .from(todos)
      .where(and(eq(todos.donorId, donorId), eq(todos.organizationId, organizationId)))
      .orderBy(desc(todos.createdAt));

    return {
      donor,
      donations: donationsData,
      communications: communicationsData,
      research: researchData[0] || null,
      todos: todosData,
      totalDonated,
      donationCount,
      lastDonationDate,
      firstDonationDate,
    };
  } catch (error) {
    logger.error(`Error fetching donor history for donor ${donorId}:`, error);
    throw error;
  }
}

/**
 * Process multiple donors in parallel and get their histories
 */
async function fetchMultipleDonorHistories(
  donorIds: number[],
  organizationId: string
): Promise<Map<number, DonorHistory>> {
  const historyMap = new Map<number, DonorHistory>();
  
  // Process donors in parallel
  const results = await Promise.allSettled(
    donorIds.map(donorId => fetchDonorHistory(donorId, organizationId))
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      historyMap.set(donorIds[index], result.value);
    } else if (result.status === "rejected") {
      logger.error(`Failed to fetch history for donor ${donorIds[index]}:`, result.reason);
    }
  });

  return historyMap;
}

/**
 * Format donor history for LLM analysis
 */
function formatDonorHistoryForLLM(donorHistory: DonorHistory): string {
  const { donor, donations, communications, research, todos, totalDonated, donationCount, lastDonationDate, firstDonationDate } = donorHistory;
  
  let formatted = `=== Donor Profile: ${donor.firstName} ${donor.lastName} ===\n`;
  
  // Basic info
  formatted += `\nBasic Information:\n`;
  formatted += `- Name: ${donor.displayName || `${donor.firstName} ${donor.lastName}`}\n`;
  if (donor.isCouple) {
    formatted += `- Couple: ${donor.hisFirstName || ""} ${donor.hisLastName || ""} & ${donor.herFirstName || ""} ${donor.herLastName || ""}\n`;
  }
  formatted += `- Email: ${donor.email}\n`;
  if (donor.phone) formatted += `- Phone: ${donor.phone}\n`;
  if (donor.address) formatted += `- Address: ${donor.address}\n`;
  if (donor.state) formatted += `- State: ${donor.state}\n`;
  if (donor.currentStageName) formatted += `- Current Stage: ${donor.currentStageName}\n`;
  if (donor.highPotentialDonor !== null) formatted += `- High Potential: ${donor.highPotentialDonor ? "Yes" : "No"}\n`;
  
  // Donation summary
  formatted += `\nDonation Summary:\n`;
  formatted += `- Total Donated: $${(totalDonated / 100).toFixed(2)}\n`;
  formatted += `- Number of Donations: ${donationCount}\n`;
  if (firstDonationDate) formatted += `- First Donation: ${firstDonationDate.toLocaleDateString()}\n`;
  if (lastDonationDate) formatted += `- Last Donation: ${lastDonationDate.toLocaleDateString()}\n`;
  
  // Recent donations
  if (donations.length > 0) {
    formatted += `\nRecent Donations (last 10):\n`;
    donations.slice(0, 10).forEach(donation => {
      formatted += `- ${donation.date.toLocaleDateString()}: $${(donation.amount / 100).toFixed(2)} to ${donation.projectName}\n`;
    });
  }
  
  // Notes
  if (donor.notes && Array.isArray(donor.notes) && donor.notes.length > 0) {
    formatted += `\nNotes:\n`;
    (donor.notes as any[]).forEach(note => {
      formatted += `- ${note.content} (${new Date(note.createdAt).toLocaleDateString()})\n`;
    });
  }
  
  // Research insights
  if (research) {
    formatted += `\nResearch Insights:\n`;
    formatted += `Topic: ${research.researchTopic}\n`;
    if (research.researchData) {
      const data = research.researchData;
      if (data.answer) formatted += `Answer: ${data.answer}\n`;
      if (data.summaries && data.summaries.length > 0) {
        formatted += `Summary: ${data.summaries[0]}\n`;
      }
    }
    formatted += `Version: ${research.version} (${research.isLive ? "Live" : "Historical"})\n`;
  }
  
  // Recent communications
  if (communications.length > 0) {
    formatted += `\nRecent Communications (last 5):\n`;
    communications.slice(0, 5).forEach(comm => {
      formatted += `- ${comm.datetime.toLocaleDateString()} [${comm.channel}] ${comm.direction}: ${comm.content.substring(0, 100)}...\n`;
    });
  }
  
  // Active todos
  const activeTodos = todos.filter(todo => todo.status !== "COMPLETED");
  if (activeTodos.length > 0) {
    formatted += `\nActive Tasks:\n`;
    activeTodos.forEach(todo => {
      formatted += `- [${todo.priority}] ${todo.title}: ${todo.description}\n`;
      if (todo.dueDate) formatted += `  Due: ${todo.dueDate.toLocaleDateString()}\n`;
    });
  }
  
  return formatted;
}

/**
 * Create the donor analysis tool configuration
 */
export function createDonorAnalysisTool(organizationId: string) {
  return {
    analyzeDonors: {
      description: `Analyze multiple donors to answer questions about their history, donations, relationships, and patterns. 
        This tool fetches comprehensive donor information including:
        - Complete donation history
        - Notes and research insights
        - Communication history
        - Active tasks and todos
        - High potential donor status
        
        Use this tool when you need to analyze patterns across multiple donors or answer questions that require detailed donor context.`,
      parameters: z.object({
        donorIds: z.array(z.number()).describe("Array of donor IDs to analyze"),
        question: z.string().describe("The question to answer about these donors"),
      }),
      execute: async (params: { donorIds: number[]; question: string }) => {
        const { donorIds, question } = params;
        
        logger.info(`[WhatsApp AI] Analyzing ${donorIds.length} donors for question: ${question.substring(0, 100)}...`);
        
        try {
          // Fetch all donor histories in parallel
          const startTime = Date.now();
          const donorHistories = await fetchMultipleDonorHistories(donorIds, organizationId);
          const fetchTime = Date.now() - startTime;
          
          logger.info(`[WhatsApp AI] Fetched history for ${donorHistories.size} donors in ${fetchTime}ms`);
          
          if (donorHistories.size === 0) {
            return {
              success: false,
              error: "No valid donor data found for the provided IDs",
            };
          }
          
          // Format all donor data for LLM
          let donorDataFormatted = "";
          donorHistories.forEach((history) => {
            donorDataFormatted += formatDonorHistoryForLLM(history) + "\n\n";
          });
          
          // Create prompt for LLM
          const systemPrompt = `You are an AI assistant analyzing donor data for a nonprofit organization. 
            You have been provided with comprehensive donor histories including donations, notes, communications, and research insights.
            Answer the question based on the data provided. Be specific and cite relevant information from the donor records.
            If the data doesn't contain enough information to fully answer the question, indicate what additional information would be helpful.`;
          
          const userPrompt = `Here is the donor data:\n\n${donorDataFormatted}\n\nQuestion: ${question}\n\nPlease analyze the donor data and answer the question.`;
          
          // Send to LLM for analysis
          const llmStartTime = Date.now();
          const result = await generateText({
            model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
            maxTokens: 2000,
          });
          const llmTime = Date.now() - llmStartTime;
          
          logger.info(`[WhatsApp AI] LLM analysis completed in ${llmTime}ms - ${result.usage?.totalTokens || 0} tokens used`);
          
          return {
            success: true,
            analysis: result.text,
            donorsAnalyzed: donorHistories.size,
            tokensUsed: result.usage?.totalTokens || 0,
          };
          
        } catch (error) {
          logger.error(`[WhatsApp AI] Error in donor analysis:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred during analysis",
          };
        }
      },
    },
  };
}