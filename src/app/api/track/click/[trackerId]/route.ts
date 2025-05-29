import { NextRequest, NextResponse } from "next/server";
import { getLinkTracker, recordLinkClick } from "@/app/lib/data/email-tracking";
import { extractTrackingMetadata } from "@/app/lib/utils/email-tracking/utils";
import { logger } from "@/app/lib/logger";

/**
 * Handles link click tracking and redirection
 * GET /api/track/click/[trackerId]?url=originalUrl
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ trackerId: string }> }) {
  const { trackerId } = await params;
  const { searchParams } = new URL(request.url);
  const originalUrl = searchParams.get("url");

  try {
    // Verify the tracker exists
    const linkTracker = await getLinkTracker(trackerId);
    if (!linkTracker) {
      logger.warn(`Link tracker not found: ${trackerId}`);
      // Redirect to the URL from query param if available, otherwise to a default page
      const fallbackUrl = originalUrl || "https://app.givance.ai";
      return NextResponse.redirect(fallbackUrl);
    }

    // Extract tracking metadata
    const metadata = extractTrackingMetadata(request);

    // Record the link click
    await recordLinkClick(trackerId, metadata);

    logger.info(
      `Link clicked: trackerId=${trackerId}, originalUrl=${linkTracker.originalUrl}, ipAddress=${metadata.ipAddress}`
    );

    // Redirect to the original URL
    const redirectUrl = linkTracker.originalUrl;

    // Validate the URL to prevent open redirects
    try {
      new URL(redirectUrl);
    } catch {
      logger.warn(`Invalid redirect URL: ${redirectUrl}, using fallback`);
      return NextResponse.redirect("https://app.givance.ai");
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    logger.error(
      `Error tracking link click: trackerId=${trackerId}, error=${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    // Fallback redirect
    const fallbackUrl = originalUrl || "https://app.givance.ai";
    try {
      new URL(fallbackUrl);
      return NextResponse.redirect(fallbackUrl);
    } catch {
      return NextResponse.redirect("https://app.givance.ai");
    }
  }
}
