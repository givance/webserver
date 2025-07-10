import { task, logger as triggerLogger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { EmailSendingService } from '@/app/lib/services/email-sending.service';

// Define the payload schema
const sendSingleEmailPayloadSchema = z.object({
  emailId: z.number(),
  jobId: z.number(),
  sessionId: z.number(),
  organizationId: z.string(),
  userId: z.string(),
});

type SendSingleEmailPayload = z.infer<typeof sendSingleEmailPayloadSchema>;

/**
 * Trigger job for sending a single scheduled email
 */
export const sendSingleEmailTask = task({
  id: 'send-single-email',
  run: async (payload: SendSingleEmailPayload, { ctx }) => {
    const emailSendingService = new EmailSendingService();

    triggerLogger.info(`Trigger job starting email send for ${payload.emailId}`);

    const result = await emailSendingService.sendEmail(payload);

    if (result.status === 'failed') {
      triggerLogger.error(`Email send failed: ${result.error}`);
      throw new Error(result.error);
    }

    triggerLogger.info(`Trigger job completed: ${result.status} for email ${result.emailId}`);

    return result;
  },
});
