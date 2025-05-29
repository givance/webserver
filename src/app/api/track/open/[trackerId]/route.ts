import { NextRequest, NextResponse } from "next/server";
import { getEmailTracker, recordEmailOpen } from "@/app/lib/data/email-tracking";
import { extractTrackingMetadata, createTrackingPixel } from "@/app/lib/utils/email-tracking/utils";
import { logger } from "@/app/lib/logger";

/**
 * Handles email open tracking via 1x1 pixel image
 * GET /api/track/open/[trackerId]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ trackerId: string }> }) {
  let { trackerId } = await params;

  // Handle quoted-printable encoded tracker IDs
  // Gmail might encode the URL, so we need to decode it
  if (trackerId.includes("=")) {
    try {
      // Decode quoted-printable encoding (=3D becomes =, etc.)
      trackerId = trackerId
        .replace(/=3D/g, "=")
        .replace(/=22/g, '"')
        .replace(/=27/g, "'")
        .replace(/=20/g, " ")
        .replace(/=0A/g, "\n")
        .replace(/=0D/g, "\r");
    } catch (error) {
      logger.warn(`Failed to decode tracker ID: ${trackerId}`);
    }
  }

  // Create headers for email client compatibility
  const headers = {
    "Content-Type": "image/png",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    // CORS headers for email clients
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type",
    // Additional headers for email client compatibility
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };

  try {
    // Verify the tracker exists
    const emailTracker = await getEmailTracker(trackerId);
    if (!emailTracker) {
      logger.warn(`Email tracker not found: ${trackerId}`);
      // Still return a pixel to avoid broken images
      const pixelBuffer = createTrackingPixel();
      return new NextResponse(new Uint8Array(pixelBuffer), {
        status: 200,
        headers,
      });
    }

    // Extract tracking metadata
    const metadata = extractTrackingMetadata(request);

    // Record the email open
    await recordEmailOpen(trackerId, metadata);

    logger.info(
      `Email opened: trackerId=${trackerId}, donorId=${emailTracker.donorId}, sessionId=${emailTracker.sessionId}, ipAddress=${metadata.ipAddress}`
    );

    // Return 1x1 transparent pixel
    const pixelBuffer = createTrackingPixel();
    return new NextResponse(new Uint8Array(pixelBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    logger.error(
      `Error tracking email open: trackerId=${trackerId}, error=${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    // Still return a pixel to avoid broken images
    const pixelBuffer = createTrackingPixel();
    return new NextResponse(new Uint8Array(pixelBuffer), {
      status: 200,
      headers,
    });
  }
}
