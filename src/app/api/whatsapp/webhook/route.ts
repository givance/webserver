import { NextRequest, NextResponse } from "next/server";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { WhatsAppAIService } from "@/app/lib/services/whatsapp/whatsapp-ai.service";
import { WhatsAppPermissionService } from "@/app/lib/services/whatsapp/whatsapp-permission.service";
import { WhatsAppStaffLoggingService } from "@/app/lib/services/whatsapp/whatsapp-staff-logging.service";
import OpenAI from "openai";

// Create OpenAI client for transcription
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * WhatsApp Webhook Handler
 * Handles both webhook verification and incoming messages
 * GET /api/whatsapp/webhook - For webhook verification
 * POST /api/whatsapp/webhook - For receiving messages
 */

// Initialize services
const whatsappAI = new WhatsAppAIService();
const permissionService = new WhatsAppPermissionService();
const loggingService = new WhatsAppStaffLoggingService();

/**
 * Download audio file from WhatsApp
 */
async function downloadWhatsAppAudio(mediaId: string, phoneNumberId: string): Promise<Buffer> {
  try {
    // Step 1: Get media URL from WhatsApp
    const mediaResponse = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      },
    });

    if (!mediaResponse.ok) {
      throw new Error(`Failed to get media URL: ${mediaResponse.status} ${mediaResponse.statusText}`);
    }

    const mediaData = await mediaResponse.json();
    const mediaUrl = mediaData.url;

    // Step 2: Download the actual audio file
    const audioResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      },
    });

    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    logger.info(`[WhatsApp Webhook] Downloaded audio file: ${audioBuffer.length} bytes`);

    return audioBuffer;
  } catch (error) {
    logger.error(
      `[WhatsApp Webhook] Error downloading audio: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Transcribe audio using OpenAI Whisper
 */
async function transcribeAudio(audioBuffer: Buffer, filename: string = "audio.ogg"): Promise<string> {
  try {
    // Create a File-like object from the buffer - convert Buffer to Uint8Array
    const audioArray = new Uint8Array(audioBuffer);
    const audioFile = new File([audioArray], filename, { type: "audio/ogg" });

    logger.info(`[WhatsApp Webhook] Starting transcription with OpenAI Whisper for file: ${filename}`);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en", // You can make this configurable or auto-detect
      response_format: "text",
    });

    logger.info(`[WhatsApp Webhook] Transcription completed: "${transcription}"`);
    return transcription;
  } catch (error) {
    logger.error(
      `[WhatsApp Webhook] Error transcribing audio: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Send a text response back to WhatsApp user
 */
async function sendWhatsAppResponse(phoneNumberId: string, to: string, messageBody: string): Promise<void> {
  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: {
          body: messageBody,
        },
      }),
    });

    const responseData = await response.text();

    if (!response.ok) {
      logger.error("[WhatsApp Webhook] Failed to send response message", {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseData,
        requestData: {
          to: to,
          messageBody: messageBody,
          phoneNumberId: phoneNumberId,
          hasToken: !!env.WHATSAPP_TOKEN,
        },
      });
      throw new Error(`Failed to send WhatsApp message: ${response.status} ${response.statusText}`);
    } else {
      logger.info("[WhatsApp Webhook] Successfully sent response back to user", {
        to: to,
        messageBody: messageBody,
        responseBody: responseData,
      });
    }
  } catch (error) {
    logger.error(
      `[WhatsApp Webhook] Error sending response: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

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

            // Check permissions first
            const permissionResult = await permissionService.checkPhonePermission(message.from);

            if (!permissionResult.isAllowed) {
              logger.warn(`[WhatsApp Webhook] Permission denied for ${message.from}: ${permissionResult.reason}`);

              // Log permission denied event
              await loggingService.logPermissionDenied(
                message.from,
                permissionResult.reason || "Unknown reason",
                message.type === "text" ? message.text.body : `${message.type} message`
              );

              // Send permission denied response
              await sendWhatsAppResponse(
                change.value.metadata.phone_number_id,
                message.from,
                "Sorry, you don't have permission to use this WhatsApp service. Please contact your administrator."
              );
              continue; // Skip to next message
            }

            const { staffId, organizationId, staff: staffInfo } = permissionResult;

            logger.info(
              `[WhatsApp Webhook] Permission granted for ${message.from} - Staff: ${staffInfo?.firstName} ${staffInfo?.lastName} (ID: ${staffId}) in org: ${organizationId}`
            );

            // Process text messages with AI
            if (message.type === "text") {
              const messageText = message.text.body;

              logger.info(`[WhatsApp Webhook] Processing text message from ${message.from}: "${messageText}"`);

              // Log message received
              await loggingService.logMessageReceived(
                staffId!,
                organizationId!,
                message.from,
                messageText,
                "text",
                message.id
              );

              const aiResponse = await whatsappAI.processMessage({
                message: messageText,
                organizationId: organizationId!,
                staffId: staffId!,
                fromPhoneNumber: message.from,
                isTranscribed: false,
              });

              const responseText = aiResponse.response;
              logger.info(`[WhatsApp Webhook] AI response generated (tokens: ${aiResponse.tokensUsed.totalTokens})`);

              // Log AI response generated
              await loggingService.logAIResponseGenerated(
                staffId!,
                organizationId!,
                message.from,
                messageText,
                responseText,
                aiResponse.tokensUsed
              );

              // Log message sent
              await loggingService.logMessageSent(
                staffId!,
                organizationId!,
                message.from,
                responseText,
                aiResponse.tokensUsed
              );

              // Send response back to user
              await sendWhatsAppResponse(change.value.metadata.phone_number_id, message.from, responseText);
            }
            // Process voice messages with AI (transcribe first)
            else if (message.type === "audio") {
              logger.info(`[WhatsApp Webhook] Processing voice message from ${message.from}`);

              try {
                // Download the audio file
                const audioBuffer = await downloadWhatsAppAudio(
                  message.audio.id,
                  change.value.metadata.phone_number_id
                );

                // Transcribe the audio
                const transcribedText = await transcribeAudio(audioBuffer, `voice_${message.id}.ogg`);

                logger.info(`[WhatsApp Webhook] Voice message transcribed: "${transcribedText}"`);

                // Log voice transcription
                await loggingService.logVoiceTranscribed(
                  staffId!,
                  organizationId!,
                  message.from,
                  message.audio.id,
                  transcribedText
                );

                // Log message received (transcribed)
                await loggingService.logMessageReceived(
                  staffId!,
                  organizationId!,
                  message.from,
                  transcribedText,
                  "audio",
                  message.id
                );

                // Process the transcribed text with AI
                const aiResponse = await whatsappAI.processMessage({
                  message: transcribedText,
                  organizationId: organizationId!,
                  staffId: staffId!,
                  fromPhoneNumber: message.from,
                  isTranscribed: true,
                });

                const responseText = aiResponse.response;
                logger.info(
                  `[WhatsApp Webhook] AI response generated for voice message (tokens: ${aiResponse.tokensUsed.totalTokens})`
                );

                // Log AI response generated
                await loggingService.logAIResponseGenerated(
                  staffId!,
                  organizationId!,
                  message.from,
                  transcribedText,
                  responseText,
                  aiResponse.tokensUsed
                );

                // Log message sent
                await loggingService.logMessageSent(
                  staffId!,
                  organizationId!,
                  message.from,
                  responseText,
                  aiResponse.tokensUsed
                );

                // Send response back to user
                await sendWhatsAppResponse(change.value.metadata.phone_number_id, message.from, responseText);
              } catch (error) {
                logger.error(
                  `[WhatsApp Webhook] Error processing voice message: ${
                    error instanceof Error ? error.message : String(error)
                  }`
                );

                // Log the error
                await loggingService.logError(
                  staffId!,
                  organizationId!,
                  message.from,
                  error instanceof Error ? error.message : String(error),
                  error,
                  "voice_message_processing"
                );

                // Send error message to user
                await sendWhatsAppResponse(
                  change.value.metadata.phone_number_id,
                  message.from,
                  "Sorry, I had trouble processing your voice message. Could you please try sending it as text instead?"
                );
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
