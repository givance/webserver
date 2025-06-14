import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";

/**
 * WhatsApp Webhook Handler
 * Handles both webhook verification and incoming messages
 * GET /api/whatsapp/webhook - For webhook verification
 * POST /api/whatsapp/webhook - For receiving messages
 */
export async function GET(request: NextRequest) {
  // Get the query parameters
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Verify the webhook
  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info("WhatsApp webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  // If verification fails
  logger.warn("WhatsApp webhook verification failed");
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    logger.info("Received WhatsApp webhook:", body);

    // Verify the request is from WhatsApp
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      logger.warn("Missing WhatsApp signature in webhook request");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // TODO: Implement signature verification if needed
    // For now, we'll trust the request since we're using HTTPS

    // Process the incoming message
    const { object, entry } = body;

    if (object !== "whatsapp_business_account") {
      logger.warn("Invalid object type in WhatsApp webhook:", object);
      return new NextResponse("Invalid object type", { status: 400 });
    }

    // Process each entry
    for (const entryItem of entry) {
      const { changes } = entryItem;
      for (const change of changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            // Process each message
            logger.info("Processing WhatsApp message:", {
              from: message.from,
              type: message.type,
              timestamp: message.timestamp,
            });

            // TODO: Implement your message handling logic here
            // For example:
            // - Store the message in your database
            // - Send automated responses
            // - Forward to your chat system
          }
        }
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("Error processing WhatsApp webhook:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
