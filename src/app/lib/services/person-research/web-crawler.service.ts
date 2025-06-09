import { logger } from "@/app/lib/logger";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { CrawledContent } from "./types";

/**
 * Service for crawling and extracting text content from webpages
 */
export class WebCrawlerService {
  private readonly MAX_CONTENT_LENGTH = 50000; // Maximum characters to extract
  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds timeout
  private readonly MAX_RETRIES = 2;

  /**
   * Crawls multiple URLs in parallel
   * @param urls - Array of URLs to crawl
   * @returns Array of crawled content results
   */
  async crawlUrls(urls: string[]): Promise<CrawledContent[]> {
    logger.info(`Starting crawl of ${urls.length} URLs`);

    const crawlPromises = urls.map(async (url) => {
      try {
        return await this.crawlSingleUrl(url);
      } catch (error) {
        logger.warn(`Failed to crawl ${url}: ${error instanceof Error ? error.message : String(error)}`);
        return {
          url,
          title: "",
          text: "",
          wordCount: 0,
          crawlSuccess: false,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date(),
        };
      }
    });

    const results = await Promise.all(crawlPromises);
    const successfulCrawls = results.filter((result) => result.crawlSuccess);

    logger.info(
      `Crawl completed: ${successfulCrawls.length}/${
        urls.length
      } successful, total words extracted: ${successfulCrawls.reduce((sum, r) => sum + r.wordCount, 0)}`
    );

    return results;
  }

  /**
   * Crawls a single URL and extracts text content
   * @param url - URL to crawl
   * @returns Crawled content
   */
  async crawlSingleUrl(url: string): Promise<CrawledContent> {
    logger.debug(`Crawling URL: ${url}`);

    // Skip non-webpage URLs
    if (!this.isValidWebUrl(url)) {
      return {
        url,
        title: "",
        text: "",
        wordCount: 0,
        crawlSuccess: false,
        errorMessage: "Invalid or non-webpage URL",
        timestamp: new Date(),
      };
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.MAX_RETRIES) {
      try {
        const content = await this.fetchWithTimeout(url);
        const extractedContent = this.extractTextContent(content, url);

        logger.debug(`Successfully crawled ${url}: ${extractedContent.wordCount} words extracted`);

        return {
          ...extractedContent,
          crawlSuccess: true,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt < this.MAX_RETRIES) {
          logger.debug(`Crawl attempt ${attempt} failed for ${url}, retrying...`);
          await this.delay(1000 * attempt); // Progressive delay
        }
      }
    }

    logger.warn(`All crawl attempts failed for ${url}: ${lastError?.message}`);

    return {
      url,
      title: "",
      text: "",
      wordCount: 0,
      crawlSuccess: false,
      errorMessage: lastError?.message || "Unknown error",
      timestamp: new Date(),
    };
  }

  /**
   * Fetches webpage content with timeout
   */
  private async fetchWithTimeout(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extracts text content from HTML using cheerio and jsdom
   */
  private extractTextContent(
    html: string,
    url: string
  ): { url: string; title: string; text: string; wordCount: number } {
    try {
      // Parse with cheerio for better performance on large documents
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $("script, style, nav, footer, header, aside, .advertisement, .ads, .sidebar, .menu, .navigation").remove();
      $('[class*="ad"], [class*="banner"], [class*="popup"], [class*="modal"]').remove();

      // Extract title
      const title = $("title").text().trim() || $("h1").first().text().trim() || "";

      // Extract main content - prioritize semantic elements
      let mainContent = "";

      const contentSelectors = [
        "main",
        "article",
        '[role="main"]',
        ".content",
        ".main-content",
        ".post-content",
        ".entry-content",
        ".article-content",
        "#content",
        "#main",
      ];

      // Try to find main content area first
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          mainContent = element.text();
          break;
        }
      }

      // If no main content area found, extract from body
      if (!mainContent) {
        mainContent = $("body").text();
      }

      // Clean up the text
      let cleanText = mainContent
        .replace(/\s+/g, " ") // Replace multiple whitespace with single space
        .replace(/\n\s*\n/g, "\n") // Remove empty lines
        .trim();

      // Truncate if too long
      if (cleanText.length > this.MAX_CONTENT_LENGTH) {
        cleanText = cleanText.substring(0, this.MAX_CONTENT_LENGTH) + "...";
      }

      const wordCount = cleanText.split(/\s+/).filter((word) => word.length > 0).length;

      return {
        url,
        title,
        text: cleanText,
        wordCount,
      };
    } catch (error) {
      // Fallback to JSDOM if cheerio fails
      logger.debug(
        `Cheerio parsing failed for ${url}, trying JSDOM: ${error instanceof Error ? error.message : String(error)}`
      );
      return this.extractWithJSDOM(html, url);
    }
  }

  /**
   * Fallback text extraction using JSDOM
   */
  private extractWithJSDOM(html: string, url: string): { url: string; title: string; text: string; wordCount: number } {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Remove unwanted elements
      const unwantedSelectors = ["script", "style", "nav", "footer", "header", "aside"];
      unwantedSelectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => el.remove());
      });

      const title = document.title || document.querySelector("h1")?.textContent || "";

      // Try to get main content
      const mainElement =
        document.querySelector("main") ||
        document.querySelector("article") ||
        document.querySelector(".content") ||
        document.body;

      let text = mainElement?.textContent || "";
      text = text.replace(/\s+/g, " ").trim();

      if (text.length > this.MAX_CONTENT_LENGTH) {
        text = text.substring(0, this.MAX_CONTENT_LENGTH) + "...";
      }

      const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;

      return {
        url,
        title,
        text,
        wordCount,
      };
    } catch (error) {
      logger.warn(`JSDOM parsing also failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      return {
        url,
        title: "",
        text: "",
        wordCount: 0,
      };
    }
  }

  /**
   * Validates if a URL is suitable for crawling
   */
  private isValidWebUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Only allow HTTP and HTTPS
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }

      // Skip common file extensions that aren't webpages
      const skipExtensions = [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".zip",
        ".rar",
        ".tar",
        ".gz",
        ".mp3",
        ".mp4",
        ".avi",
        ".mov",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".svg",
        ".css",
        ".js",
        ".json",
        ".xml",
      ];
      const pathname = urlObj.pathname.toLowerCase();

      if (skipExtensions.some((ext) => pathname.endsWith(ext))) {
        return false;
      }

      // Skip social media login/redirect URLs
      const skipDomains = ["accounts.google.com", "login.", "auth.", "signin.", "signup."];
      if (skipDomains.some((domain) => urlObj.hostname.includes(domain))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
