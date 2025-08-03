/**
 * Salesforce-specific tool for creating InteractionSummary records via WhatsApp
 */

import { z } from 'zod';
import { logger } from '@/app/lib/logger';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';

const SALESFORCE_ADD_NOTE_DESCRIPTION = `Create an InteractionSummary record in Salesforce. This tool allows you to add notes about interactions, personal information, family details, preferences, or any other relevant information.

Examples of notes you can add:
- Family information: "Daughter attends Harvard University"
- Personal preferences: "Prefers to be contacted by email"  
- Meeting notes: "Met at the gala, interested in education initiatives"
- Important dates: "Birthday is March 15th"
- Giving preferences: "Interested in supporting youth programs"

IMPORTANT: 
- For Accounts: Creates an InteractionSummary linked to the Account
- For Contacts: Finds the associated Account and creates an InteractionSummary linked to that Account
- If a Contact has no Account, the user must create an Account first`;

export function createSalesforceAddNoteTool(
  organizationId: string,
  loggingService: WhatsAppStaffLoggingService,
  staffId: number,
  fromPhoneNumber: string,
  accessToken: string,
  instanceUrl: string
) {
  return {
    addInteractionSummary: {
      description: SALESFORCE_ADD_NOTE_DESCRIPTION,
      parameters: z.object({
        recordId: z.string().describe('The Salesforce Account ID or Contact ID'),
        recordType: z
          .enum(['Account', 'Contact'])
          .describe('The type of record (Account or Contact)'),
        recordName: z
          .string()
          .optional()
          .describe('The name of the record (for confirmation/logging purposes)'),
        noteContent: z.string().describe('The content of the interaction summary to add'),
      }),
      execute: async (params: {
        recordId: string;
        recordType: 'Account' | 'Contact';
        recordName?: string;
        noteContent: string;
      }) => {
        const startTime = Date.now();

        try {
          logger.info('[WhatsApp Salesforce Add Note] Starting to add interaction summary', {
            recordId: params.recordId,
            recordType: params.recordType,
            recordName: params.recordName,
            organizationId,
            staffId,
          });

          const apiVersion = 'v60.0';
          let accountId = params.recordId;

          // If it's a Contact, we need to find the associated Account
          if (params.recordType === 'Contact') {
            const contactUrl = `${instanceUrl}/services/data/${apiVersion}/sobjects/Contact/${params.recordId}`;

            const contactResponse = await fetch(contactUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (!contactResponse.ok) {
              const errorData = await contactResponse.json();
              logger.error('[WhatsApp Salesforce Add Note] Failed to fetch contact', {
                status: contactResponse.status,
                error: errorData,
                contactId: params.recordId,
              });

              return {
                success: false,
                error: `Failed to fetch contact information: ${
                  errorData[0]?.message || contactResponse.statusText
                }`,
              };
            }

            const contact = await contactResponse.json();

            if (!contact.AccountId) {
              logger.warn('[WhatsApp Salesforce Add Note] Contact has no associated Account', {
                contactId: params.recordId,
                contactName: params.recordName,
              });

              return {
                success: false,
                error: `This contact does not have an associated Account. Please create an Account for this contact first before adding notes.`,
                needsAccount: true,
                contactId: params.recordId,
                contactName: params.recordName || contact.Name,
              };
            }

            accountId = contact.AccountId;
            logger.info('[WhatsApp Salesforce Add Note] Found Account for Contact', {
              contactId: params.recordId,
              accountId: accountId,
            });
          }

          // Create an InteractionSummary record
          const interactionSummaryData = {
            Name: `WhatsApp Note - ${new Date().toLocaleString()}`,
            AccountId: accountId,
            MeetingNotes: params.noteContent,
            Status: 'Published',
            InteractionPurpose: 'Meet and Greet',
            ConfidentialityType: 'Public',
          };

          const createUrl = `${instanceUrl}/services/data/${apiVersion}/sobjects/InteractionSummary`;

          const createResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(interactionSummaryData),
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json();
            logger.error('[WhatsApp Salesforce Add Note] Failed to create InteractionSummary', {
              status: createResponse.status,
              error: errorData,
              accountId: accountId,
            });

            return {
              success: false,
              error: `Failed to create interaction summary: ${
                errorData[0]?.message || createResponse.statusText
              }`,
            };
          }

          const result = await createResponse.json();

          const processingTime = Date.now() - startTime;

          // Log the activity
          await loggingService.logActivity({
            staffId,
            organizationId,
            phoneNumber: fromPhoneNumber,
            activityType: 'donor_note_added',
            summary: `Created InteractionSummary for Salesforce Account: ${
              params.recordName || accountId
            }`,
            data: {
              accountId: accountId,
              interactionSummaryId: result.id,
              originalRecordId: params.recordId,
              originalRecordType: params.recordType,
              recordName: params.recordName,
              notePreview: params.noteContent.substring(0, 100),
            },
          });

          logger.info('[WhatsApp Salesforce Add Note] InteractionSummary created successfully', {
            accountId: accountId,
            interactionSummaryId: result.id,
            originalRecordId: params.recordId,
            originalRecordType: params.recordType,
            processingTimeMs: processingTime,
          });

          return {
            success: true,
            accountId: accountId,
            interactionSummaryId: result.id,
            recordName: params.recordName || accountId,
            noteAdded: params.noteContent,
            message: `Interaction summary successfully created for ${
              params.recordName || 'the account'
            } in Salesforce.`,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          logger.error('[WhatsApp Salesforce Add Note] Unexpected error', {
            error,
            recordId: params.recordId,
            recordType: params.recordType,
          });

          await loggingService.logError(
            staffId,
            organizationId,
            fromPhoneNumber,
            `Failed to add interaction summary to Salesforce: ${errorMessage}`,
            error,
            'salesforce_add_note_error'
          );

          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    },
  };
}
