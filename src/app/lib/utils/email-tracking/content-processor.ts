import { EmailPiece } from "../email-generator/types";
import { LinkTracker, ProcessedEmailContent } from "./types";
import { generateTrackingId } from "./utils";
import { env } from "../../env";
import { db } from "../../db";
import { signatureImages } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * URL regex pattern to match various URL formats
 */
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

/**
 * Regex to detect if content is already HTML
 */
const HTML_TAG_REGEX = /<[^>]+>/;

/**
 * Gets the base URL for tracking from environment or parameter
 */
function getTrackingBaseUrl(baseUrl?: string): string {
  if (baseUrl) {
    return baseUrl;
  }

  // Use BASE_URL from environment configuration
  if (env.BASE_URL) {
    return env.BASE_URL;
  }

  // Fallback: Try to derive from GOOGLE_REDIRECT_URI
  try {
    const redirectUri = env.GOOGLE_REDIRECT_URI;
    const url = new URL(redirectUri);
    return `${url.protocol}//${url.host}`;
  } catch {
    // Final fallback to a default
    return "https://app.givance.ai";
  }
}

/**
 * Converts data: URLs in HTML to hosted URLs for email client compatibility
 */
async function convertDataUrlsToHostedUrls(html: string, baseUrl?: string): Promise<string> {
  const trackingBaseUrl = getTrackingBaseUrl(baseUrl);

  // Find all data: URLs in img src attributes
  const dataUrlRegex = /<img([^>]*)\ssrc="data:image\/([^;]+);base64,([^"]+)"([^>]*)>/gi;

  let result = html;
  let match;

  while ((match = dataUrlRegex.exec(html)) !== null) {
    const [fullMatch, beforeSrc, mimeType, base64Data, afterSrc] = match;

    try {
      // Try to find existing image in database by base64 data
      const existingImage = await db
        .select()
        .from(signatureImages)
        .where(eq(signatureImages.base64Data, base64Data))
        .limit(1);

      if (existingImage[0]) {
        // Use existing image
        const hostedUrl = `${trackingBaseUrl}/api/signature-image/${existingImage[0].id}`;
        const newImgTag = `<img${beforeSrc} src="${hostedUrl}"${afterSrc}>`;
        result = result.replace(fullMatch, newImgTag);
        console.log(`[SIGNATURE DEBUG] Converted data URL to hosted URL: ${hostedUrl}`);
      } else {
        console.log(`[SIGNATURE DEBUG] No matching image found in database for base64 data`);
        // Keep the data URL as fallback
      }
    } catch (error) {
      console.error(`[SIGNATURE DEBUG] Error converting data URL:`, error);
      // Keep the original data URL on error
    }
  }

  return result;
}

/**
 * Converts structured email content to HTML with tracking pixels and link tracking
 */
export async function processEmailContentWithTracking(
  structuredContent: EmailPiece[],
  emailTrackerId: string,
  baseUrl?: string
): Promise<ProcessedEmailContent> {
  const linkTrackers: LinkTracker[] = [];
  let linkPosition = 0;

  // Get the tracking base URL
  const trackingBaseUrl = getTrackingBaseUrl(baseUrl);

  // Convert structured content to HTML with link tracking
  const htmlPieces = await Promise.all(
    structuredContent.map(async (piece) => {
      let processedPiece = piece.piece;

      // Check if this piece is already HTML (e.g., signatures)
      const isSignature = piece.references.includes("signature");
      const containsHTML = HTML_TAG_REGEX.test(piece.piece);
      const isAlreadyHTML = isSignature || containsHTML;

      if (!isAlreadyHTML) {
        // Find and replace URLs with tracking URLs for plain text content
        processedPiece = processedPiece.replace(URL_REGEX, (match, url) => {
          linkPosition++;
          const linkTrackerId = generateTrackingId();

          // Extract link text (use URL as fallback)
          const linkText = url;

          // Create link tracker
          const linkTracker: LinkTracker = {
            id: linkTrackerId,
            emailTrackerId,
            originalUrl: url,
            linkText,
            position: linkPosition,
            createdAt: new Date(),
          };

          linkTrackers.push(linkTracker);

          // Create tracking URL
          const trackingUrl = `${trackingBaseUrl}/api/track/click/${linkTrackerId}?url=${encodeURIComponent(url)}`;

          return `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        });

        // Handle line breaks more carefully to avoid excessive spacing
        const lines = processedPiece.split("\n");
        const nonEmptyLines = lines.filter((line) => line.trim() !== "");

        // If there are multiple non-empty lines, join them with <br>
        if (nonEmptyLines.length > 1) {
          processedPiece = nonEmptyLines.join("<br>");
        } else {
          // Single line, no need for <br> tags
          processedPiece = nonEmptyLines[0] || "";
        }

        // Only wrap in paragraph if it should have a newline after AND has content
        if (piece.addNewlineAfter && processedPiece.trim()) {
          return `<p style="margin: 0 0 1em 0;">${processedPiece}</p>`;
        } else {
          return processedPiece;
        }
      } else {
        // For HTML content (like signatures), process embedded links but preserve HTML structure
        processedPiece = processedPiece.replace(URL_REGEX, (match, url) => {
          // Skip data: URLs (like base64 images) completely
          if (url.startsWith("data:")) return match;

          // Skip if URL is already in an href attribute or inside an img tag
          const matchIndex = processedPiece.indexOf(match);
          const context = processedPiece.substring(Math.max(0, matchIndex - 100), matchIndex + match.length + 100);

          // More thorough checking for existing attributes
          if (
            context.includes("href=") ||
            context.includes("src=") ||
            context.includes("<img") ||
            context.includes("<a ")
          ) {
            return match;
          }

          linkPosition++;
          const linkTrackerId = generateTrackingId();

          // Extract link text (use URL as fallback)
          const linkText = url;

          // Create link tracker
          const linkTracker: LinkTracker = {
            id: linkTrackerId,
            emailTrackerId,
            originalUrl: url,
            linkText,
            position: linkPosition,
            createdAt: new Date(),
          };

          linkTrackers.push(linkTracker);

          // Create tracking URL
          const trackingUrl = `${trackingBaseUrl}/api/track/click/${linkTrackerId}?url=${encodeURIComponent(url)}`;

          return `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        });

        // For signatures, ensure proper HTML structure and convert data URLs
        if (isSignature) {
          // Debug: Log the original signature content
          console.log("[SIGNATURE DEBUG] Original signature content:", processedPiece.substring(0, 200) + "...");
          console.log("[SIGNATURE DEBUG] Contains img tag:", processedPiece.includes("<img"));
          console.log("[SIGNATURE DEBUG] Contains src attribute:", processedPiece.includes("src="));
          console.log("[SIGNATURE DEBUG] Contains data:image:", processedPiece.includes("data:image"));

          // Convert data: URLs to hosted URLs for Gmail compatibility
          processedPiece = await convertDataUrlsToHostedUrls(processedPiece, baseUrl);

          // Clean up the HTML to ensure proper structure
          processedPiece = processedPiece.trim();

          // If signature doesn't start with a block element, wrap it in a div with minimal spacing
          if (
            !processedPiece.startsWith("<div") &&
            !processedPiece.startsWith("<p") &&
            !processedPiece.startsWith("<table")
          ) {
            processedPiece = `<div style="margin-top: 0.5em; margin-bottom: 0;">${processedPiece}</div>`;
          }

          // Debug: Log the final processed signature content
          console.log("[SIGNATURE DEBUG] Final signature content:", processedPiece.substring(0, 200) + "...");
        }

        // Return HTML content as-is (no paragraph wrapping)
        return processedPiece;
      }
    })
  );

  // Join HTML pieces with proper spacing
  let htmlContent = htmlPieces.filter((piece) => piece.trim()).join("");

  // Add tracking pixel with minimal attributes to avoid quoted-printable encoding
  const trackingPixelUrl = `${trackingBaseUrl}/api/track/open/${emailTrackerId}`;
  // Use the simplest possible HTML - no quotes around attribute values
  const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">`;

  htmlContent += trackingPixel;

  // Create text version (without tracking)
  const textContent = convertStructuredContentToText(structuredContent);

  return {
    htmlContent,
    textContent,
    linkTrackers,
  };
}

/**
 * Converts structured content to plain text (existing functionality)
 */
export function convertStructuredContentToText(structuredContent: EmailPiece[]): string {
  return structuredContent
    .map((piece) => piece.piece + (piece.addNewlineAfter ? "\n\n" : ""))
    .join("")
    .trim();
}

/**
 * Encodes a string using RFC 2047 MIME encoded-word syntax for email headers
 * This is needed for non-ASCII characters in subject lines
 */
function encodeEmailHeaderValue(value: string): string {
  // Check if the string contains only ASCII characters
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }

  // Encode using base64 with UTF-8 charset per RFC 2047
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

/**
 * Creates a complete HTML email with proper MIME structure to prevent quoted-printable corruption
 */
export function createHtmlEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string,
  from?: string
): string {
  // Encode the subject line to handle special characters like smart quotes
  const encodedSubject = encodeEmailHeaderValue(subject);

  // Enhanced HTML structure with better email client compatibility
  const htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
<style>
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
    line-height: 1.6; 
    color: #333; 
    margin: 0; 
    padding: 20px; 
  }
  p { margin: 0 0 1em 0; }
  img { max-width: 100%; height: auto; }
  .signature-image { max-height: 150px; width: auto; }
  a { color: #007bff; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

  // Build the email headers with properly encoded subject
  let headers = `MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
To: ${to}
Subject: ${encodedSubject}`;

  // Add From header if provided to ensure correct sender
  if (from) {
    headers = `MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
From: ${from}
To: ${to}
Subject: ${encodedSubject}`;
  }

  return `${headers}

${htmlBody}`;
}

/**
 * Creates a simple text email (fallback)
 */
export function createTextEmail(to: string, subject: string, textContent: string, from?: string): string {
  // Encode the subject line to handle special characters like smart quotes
  const encodedSubject = encodeEmailHeaderValue(subject);

  // Build the email headers with properly encoded subject
  let headers = `To: ${to}
Subject: ${encodedSubject}`;

  // Add From header if provided to ensure correct sender
  if (from) {
    headers = `From: ${from}
To: ${to}
Subject: ${encodedSubject}`;
  }

  return `${headers}

${textContent}`;
}
