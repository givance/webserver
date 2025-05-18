import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
// import { triggerClient } from "@/trigger"; // Removed v2 client
import { db } from "@/app/lib/db"; // Assuming db client is here
import { organizations } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@ai-sdk/openai"; // Corrected import: lowercase openai
import { generateText, type CoreTool } from "ai";
// import { JSDOM } from "jsdom"; // Removed JSDOM
import * as cheerio from "cheerio"; // Added cheerio
import { env } from "@/app/lib/env"; // Import env variables
import pino from "pino";
// import type { TaskRunContext, TaskLogger } from "@trigger.dev/sdk/v3"; // Removed, use logger from v3 import

const baseLogger = pino(); // Use separate logger for non-task specific logs

// Define the payload schema using Zod
const crawlPayloadSchema = z.object({
  url: z.string().url("Invalid URL provided."),
  organizationId: z.string().min(1, "Organization ID is required."),
});

type CrawlPayload = z.infer<typeof crawlPayloadSchema>;

/**
 * Fetches HTML content from a URL.
 * @param url - The URL to fetch.
 * @returns The HTML content as text, or null if fetching fails.
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "FundraisingBot/1.0" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      baseLogger.warn(`Failed to fetch HTML from ${url}: Status ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    baseLogger.error(`Error fetching ${url}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extracts text content and valid URLs from HTML using Cheerio.
 * @param html - The HTML content as a string.
 * @param baseUrl - The base URL for resolving relative links.
 * @returns An object containing the extracted text and a set of valid URLs.
 */
function extractContentAndLinks(html: string, baseUrl: string): { text: string; urls: Set<string> } {
  try {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $("script, style").remove();

    // Extract text content from the modified body
    const bodyText = $("body").text();
    const text = bodyText.replace(/\s\s+/g, " ").trim();

    const urls = new Set<string>();
    const base = new URL(baseUrl);

    $("a").each((i, element) => {
      const href = $(element).attr("href");
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          const urlObj = new URL(absoluteUrl);
          if ((urlObj.protocol === "http:" || urlObj.protocol === "https:") && urlObj.hostname === base.hostname) {
            urls.add(absoluteUrl);
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }
    });
    return { text, urls };
  } catch (error) {
    baseLogger.error(
      `Error parsing HTML with Cheerio or extracting links from ${baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { text: "", urls: new Set<string>() };
  }
}

// Define the task using the v3 syntax
export const crawlAndSummarizeWebsiteTask = task({
  id: "crawl-and-summarize-website",
  // name: "Crawl and Summarize Website for Fundraising Info", // Removed name property
  /**
   * The main function for the task.
   * Crawls a website, summarizes content using AI, and updates the organization record.
   */
  run: async (payload: CrawlPayload, { ctx }) => {
    // Updated signature
    const { url, organizationId } = payload;
    // Use imported logger for task logging
    triggerLogger.info(`Starting crawl for ${url} (organizationId: ${organizationId})`);

    const visitedUrls = new Set<string>();
    const urlsToVisit = new Set<string>([url]);
    let allTextContent = "";
    const maxUrls = 30;
    const concurrencyLimit = 10; // Number of URLs to process concurrently

    // Crawling loop
    while (urlsToVisit.size > 0 && visitedUrls.size < maxUrls) {
      const batchSize = Math.min(urlsToVisit.size, concurrencyLimit, maxUrls - visitedUrls.size);
      const currentBatch = Array.from(urlsToVisit).slice(0, batchSize);

      // Remove batch from queue and add to visited (optimistic)
      currentBatch.forEach((url) => {
        urlsToVisit.delete(url);
        visitedUrls.add(url); // Add to visited before processing
      });

      triggerLogger.info(
        `Processing batch of ${currentBatch.length} URLs (total visited: ${visitedUrls.size}/${maxUrls})`
      );

      const promises = currentBatch.map(async (currentUrl) => {
        if (!currentUrl) return null; // Should not happen with Set, but safety check
        try {
          triggerLogger.debug(`Crawling: ${currentUrl}`);
          const html = await fetchHtml(currentUrl);
          if (!html) {
            return null; // Skip if fetching failed
          }
          return extractContentAndLinks(html, currentUrl);
        } catch (error) {
          triggerLogger.error(
            `Error processing ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`
          );
          return null; // Indicate failure for this URL
        }
      });

      const results = await Promise.allSettled(promises);

      // Process results of the batch
      results.forEach((result, index) => {
        const processedUrl = currentBatch[index];
        if (result.status === "fulfilled" && result.value) {
          const { text, urls: foundUrls } = result.value;
          allTextContent += text + "\n\n";

          // Add newly found, unvisited URLs to the queue
          foundUrls.forEach((link) => {
            if (!visitedUrls.has(link) && !urlsToVisit.has(link) && visitedUrls.size + urlsToVisit.size < maxUrls) {
              urlsToVisit.add(link);
            }
          });
        } else if (result.status === "rejected") {
          triggerLogger.warn(`Promise rejected for ${processedUrl}: ${result.reason}`);
          // No need to remove from visitedUrls as we already added it optimistically
        }
        // If fulfilled but null, it means fetch failed or extract failed - already logged, just ignore
      });
    }

    triggerLogger.info(`Crawling finished. Total pages crawled: ${visitedUrls.size}. Summarizing content...`);

    if (!allTextContent.trim()) {
      triggerLogger.warn("No text content extracted from the website.", { organizationId });
      await db
        .update(organizations)
        .set({ websiteSummary: "Could not extract sufficient content from the website." })
        .where(eq(organizations.id, organizationId));
      return { status: "warning", message: "No content extracted" };
    }

    const maxContentLength = 150000;
    const truncatedContent =
      allTextContent.length > maxContentLength ? allTextContent.substring(0, maxContentLength) + "..." : allTextContent;

    let summary = "Summary generation failed.";
    try {
      const { text: summaryText } = await generateText({
        model: openai(env.SMALL_MODEL),
        prompt: `Summarize the following website content for a nonprofit's fundraising purposes. Focus on extracting these key details:
          1.  **Mission and impact story:** Provide a clear, concise mission statement and 2-3 compelling stories about specific people or communities the nonprofit has helped. Include concrete before/after outcomes and emotional details that illustrate the work's importance.
          2.  **Target audience demographics:** Share detailed information about the donor base - age ranges, giving history, interests, values, and what motivates them to give. Include different segments if there are various donor types. (If not explicitly stated, infer based on content).
          3.  **Tone and voice guidelines:** Specify whether the brand voice is formal/informal, urgent/measured, emotional/factual. Provide examples of past successful emails or communications that capture the preferred tone. (Infer if not explicitly stated).
          4.  **Specific campaign goals:** Clearly state what the organization is raising money for - a specific program, general operations, emergency need, etc. Include the fundraising target amount and deadline if applicable.
          5.  **Key statistics and credibility markers:** Provide impact metrics (number of people served, success rates), financial efficiency ratios, awards/recognitions, or endorsements that build trust with donors.
          6.  **Unique value proposition:** Explain what sets the nonprofit apart from others in its space and why donors should choose to support it specifically.

          Website Content:
          ---
          ${truncatedContent}
          ---

          Please provide a structured summary covering the points above.`,
      });
      summary = summaryText;
      triggerLogger.info("Summary generated successfully.");
    } catch (error) {
      baseLogger.error(`AI summarization failed: ${error instanceof Error ? error.message : String(error)}`);
      triggerLogger.error("AI Summarization failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    triggerLogger.info("Updating organization record.");

    await db.update(organizations).set({ websiteSummary: summary }).where(eq(organizations.id, organizationId));

    triggerLogger.info("✅ Successfully crawled and summarized website.", { organizationId });

    return { status: "success", summaryLength: summary.length };
  },
});
