import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { WhatsAppAIService } from "@/app/lib/services/whatsapp-ai.service";

/**
 * WhatsApp Webhook Handler
 * Handles both webhook verification and incoming messages
 * GET /api/whatsapp/webhook - For webhook verification
 * POST /api/whatsapp/webhook - For receiving messages
 */

// Default organization ID for WhatsApp queries
// TODO: Implement proper phone number to organization mapping
const DEFAULT_ORGANIZATION_ID = "org_2x0w3dnWAbi8U3Zm5jE31HbAnkS"; // Replace with actual default organization ID

const whatsappAI = new WhatsAppAIService();
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

    // Log request metadata
    logger.info("[WhatsApp Webhook] Request metadata:", {
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    });

    // Verify the request is from WhatsApp
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      logger.warn("[WhatsApp Webhook] Missing WhatsApp signature in webhook request");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // TODO: Implement signature verification if needed
    // For now, we'll trust the request since we're using HTTPS

    // Process the incoming message
    const { object, entry } = body;

    if (object !== "whatsapp_business_account") {
      logger.warn("[WhatsApp Webhook] Invalid object type:", object);
      return new NextResponse("Invalid object type", { status: 400 });
    }

    // Process each entry
    for (const entryItem of entry) {
      const { changes } = entryItem;
      for (const change of changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            // Log detailed message information
            logger.info("[WhatsApp Webhook] Processing message:", {
              from: message.from,
              type: message.type,
              timestamp: message.timestamp,
              messageId: message.id,
              metadata: {
                businessAccountId: change.value.metadata?.business_account_id,
                phoneNumberId: change.value.metadata?.phone_number_id,
              },
            });

            // Process text messages with AI if they appear to be donor queries
            if (message.type === "text") {
              const messageText = message.text.body;
              let responseText = messageText; // Default to echo

              // Check if this looks like a donor query and process with AI
              if (WhatsAppAIService.isDonorQuery(messageText)) {
                logger.info(`[WhatsApp Webhook] Detected donor query from ${message.from}: "${messageText}"`);

                try {
                  const aiResponse = await whatsappAI.processMessage({
                    message: messageText,
                    organizationId: DEFAULT_ORGANIZATION_ID,
                    fromPhoneNumber: message.from,
                  });

                  responseText = aiResponse.response;
                  logger.info(
                    `[WhatsApp Webhook] AI response generated (tokens: ${aiResponse.tokensUsed.totalTokens})`
                  );
                } catch (error) {
                  logger.error(
                    `[WhatsApp Webhook] AI processing failed: ${error instanceof Error ? error.message : String(error)}`
                  );
                  responseText =
                    "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
                }
              } else {
                logger.info(`[WhatsApp Webhook] Non-donor query, echoing message: "${messageText}"`);
              }

              // Send response back to user
              const response = await fetch(
                `https://graph.facebook.com/v17.0/${change.value.metadata.phone_number_id}/messages`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: message.from,
                    type: "text",
                    text: {
                      body: responseText,
                    },
                  }),
                }
              );

              const responseData = await response.text();

              if (!response.ok) {
                logger.error("[WhatsApp Webhook] Failed to send response message", {
                  status: response.status,
                  statusText: response.statusText,
                  responseBody: responseData,
                  requestData: {
                    to: message.from,
                    messageBody: responseText,
                    phoneNumberId: change.value.metadata.phone_number_id,
                    hasToken: !!env.WHATSAPP_TOKEN,
                  },
                });
              } else {
                logger.info("[WhatsApp Webhook] Successfully sent response back to user", {
                  to: message.from,
                  messageBody: responseText,
                  responseBody: responseData,
                });
              }
            }
          }
        }
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("[WhatsApp Webhook] Error processing webhook:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
