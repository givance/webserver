import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Communication channel enum
 */
export const communicationChannelEnum = pgEnum('communication_channel', ['email', 'phone', 'text']);

/**
 * Gender enum for donors
 */
export const genderEnum = pgEnum('gender', ['male', 'female']);

/**
 * Email generation session status enum
 */
export const emailGenerationSessionStatusEnum = pgEnum('email_generation_session_status', [
  'DRAFT',
  'GENERATING',
  'READY_TO_SEND',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
]);

// Export the enum values for use in other files
export const EmailGenerationSessionStatus = {
  DRAFT: 'DRAFT' as const,
  GENERATING: 'GENERATING' as const,
  READY_TO_SEND: 'READY_TO_SEND' as const,
  RUNNING: 'RUNNING' as const,
  PAUSED: 'PAUSED' as const,
  COMPLETED: 'COMPLETED' as const,
} as const;

/**
 * Message role enum for WhatsApp chat
 */
export const whatsappMessageRoleEnum = pgEnum('whatsapp_message_role', ['user', 'assistant']);

/**
 * Activity type enum for staff WhatsApp activity logging
 */
export const staffWhatsappActivityTypeEnum = pgEnum('staff_whatsapp_activity_type', [
  'message_received',
  'message_sent',
  'permission_denied',
  'db_query_executed',
  'ai_response_generated',
  'voice_transcribed',
  'error_occurred',
  'donor_analysis_executed',
]);

/**
 * Email example category enum
 */
export const emailExampleCategoryEnum = pgEnum('email_example_category', [
  'donor_outreach',
  'thank_you',
  'follow_up',
  'general',
  'fundraising',
  'event_invitation',
  'update',
]);

/**
 * Smart email generation session status enum
 */
export const smartEmailSessionStatusEnum = pgEnum('smart_email_session_status', [
  'active',
  'completed',
  'abandoned',
]);

/**
 * Smart email generation session step enum
 */
export const smartEmailSessionStepEnum = pgEnum('smart_email_session_step', [
  'analyzing',
  'questioning',
  'refining',
  'complete',
]);
