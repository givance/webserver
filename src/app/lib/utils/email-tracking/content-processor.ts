import { EmailPiece } from "../email-generator/types";
import { LinkTracker, ProcessedEmailContent } from "./types";
import { generateTrackingId } from "./utils";
import { env } from "../../env";

/**
 * URL regex pattern to match various URL formats
 */
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

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
 * Converts structured email content to HTML with tracking pixels and link tracking
 */
export function processEmailContentWithTracking(
  structuredContent: EmailPiece[],
  emailTrackerId: string,
  baseUrl?: string
): ProcessedEmailContent {
  const linkTrackers: LinkTracker[] = [];
  let linkPosition = 0;

  // Get the tracking base URL
  const trackingBaseUrl = getTrackingBaseUrl(baseUrl);

  // Convert structured content to HTML with link tracking
  const htmlPieces = structuredContent.map((piece) => {
    let processedPiece = piece.piece;

    // Find and replace URLs with tracking URLs
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

    // Convert line breaks to HTML <br> tags
    processedPiece = processedPiece.replace(/\n/g, "<br>");

    // Wrap in paragraph if it should have a newline after
    if (piece.addNewlineAfter) {
      return `<p>${processedPiece}</p>`;
    } else {
      return processedPiece;
    }
  });

  // Join HTML pieces
  let htmlContent = htmlPieces.join("");

  // Add tracking pixel with minimal attributes to avoid quoted-printable encoding
  const trackingPixelUrl = `${trackingBaseUrl}/api/track/open/${emailTrackerId}`;
  // Use the simplest possible HTML - no quotes around attribute values
  const trackingPixel = `<img src=${trackingPixelUrl} width=1 height=1 style=display:none>`;

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
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

/**
 * Creates a complete HTML email with proper structure
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
  
  // Simple HTML with minimal styling to avoid quoted-printable
  const htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${subject}</title>
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
