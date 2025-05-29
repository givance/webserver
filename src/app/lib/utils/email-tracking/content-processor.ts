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

  // Try to derive from GOOGLE_REDIRECT_URI
  try {
    const redirectUri = env.GOOGLE_REDIRECT_URI;
    const url = new URL(redirectUri);
    return `${url.protocol}//${url.host}`;
  } catch {
    // Fallback to a default
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

    // Wrap in paragraph if it should have a newline after
    if (piece.addNewlineAfter) {
      return `<p>${processedPiece}</p>`;
    } else {
      return processedPiece;
    }
  });

  // Join HTML pieces
  let htmlContent = htmlPieces.join("");

  // Add tracking pixel at the end of the email
  const trackingPixelUrl = `${trackingBaseUrl}/api/track/open/${emailTrackerId}`;
  const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

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
 * Creates a complete HTML email with proper structure
 */
export function createHtmlEmail(to: string, subject: string, htmlContent: string, textContent: string): string {
  return `MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="boundary123"
To: ${to}
Subject: ${subject}

--boundary123
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

${textContent}

--boundary123
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit

<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    ${htmlContent}
</body>
</html>

--boundary123--`;
}

/**
 * Creates a simple text email (fallback)
 */
export function createTextEmail(to: string, subject: string, textContent: string): string {
  return `To: ${to}
Subject: ${subject}

${textContent}`;
}
