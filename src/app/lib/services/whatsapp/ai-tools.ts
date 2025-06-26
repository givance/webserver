/**
 * AI tool configurations for WhatsApp assistant
 */

import { z } from "zod";
import { logger } from "@/app/lib/logger";
import { WhatsAppSQLEngineService } from "./whatsapp-sql-engine.service";
import { WhatsAppStaffLoggingService } from "./whatsapp-staff-logging.service";
import { SQL_TOOL_DESCRIPTION } from "./prompts";
import { SQLError } from "./types";
import { createDonorAnalysisTool } from "./donor-analysis-tool";

const FORBIDDEN_SQL_OPERATIONS = [
  "DELETE FROM",
  "DROP TABLE",
  "DROP DATABASE",
  "TRUNCATE",
  "ALTER TABLE",
  "CREATE TABLE",
  "CREATE DATABASE",
  "GRANT",
  "REVOKE",
];

/**
 * Generate helpful feedback for SQL errors to guide AI retry attempts
 */
export function generateSQLErrorFeedback(error: SQLError, failedQuery: string, retryAttempt: number): string {
  const feedback = [];

  feedback.push(`SQL Error (${error.type}): ${error.message}`);
  feedback.push(`Failed Query: ${failedQuery}`);

  if (error.suggestion) {
    feedback.push(`Suggestion: ${error.suggestion}`);
  }

  // Add specific guidance based on error type
  switch (error.type) {
    case "syntax":
      feedback.push("Fix syntax errors by checking: quotes, parentheses, semicolons, and SQL keywords.");
      feedback.push(
        "Common issues: missing single quotes around strings, unmatched parentheses, incorrect column names."
      );
      break;

    case "security":
      feedback.push(
        "Ensure security compliance: add WHERE organization_id clause for SELECT/UPDATE, include organization_id in INSERT VALUES."
      );
      break;

    case "runtime":
      feedback.push(
        "Check that: table names exist (donors, donations, projects, staff), column names are correct, and foreign key references are valid."
      );
      break;

    default:
      feedback.push(
        "Review the query for common issues: syntax errors, missing organization_id filters, incorrect table/column names."
      );
  }

  feedback.push(
    `This is retry attempt ${
      retryAttempt + 1
    }. Analyze the error carefully and rewrite the query to fix the specific issue mentioned.`
  );

  return feedback.join(" ");
}

/**
 * Create the AI tools configuration
 */
export function createAITools(
  sqlEngine: WhatsAppSQLEngineService,
  loggingService: WhatsAppStaffLoggingService,
  organizationId: string,
  staffId: number,
  fromPhoneNumber: string
) {
  const schemaDescription = sqlEngine.getSchemaDescription();
  const donorAnalysisTool = createDonorAnalysisTool(organizationId);

  return {
    executeSQL: {
      description: SQL_TOOL_DESCRIPTION.executeSQL(organizationId, schemaDescription),
      parameters: z.object({
        query: z
          .string()
          .describe(
            "The SQL query to execute (SELECT, INSERT, or UPDATE). Can be used to fetch data from the database including donor information, projects, donations, and more."
          ),
        retryAttempt: z.number().optional().describe("Internal: retry attempt number (used for error recovery)"),
        previousError: z.string().optional().describe("Internal: previous error message for context"),
      }),
      execute: async (params: any) => {
        const maxRetries = 2;
        const retryAttempt = params.retryAttempt || 0;

        logger.info(
          `[WhatsApp AI] Executing SQL query (attempt ${retryAttempt + 1}): ${params.query}`
        );

        // Security validation - check for dangerous operations
        const queryUpper = params.query.toUpperCase().trim();

        for (const operation of FORBIDDEN_SQL_OPERATIONS) {
          if (queryUpper.includes(operation)) {
            logger.error(`[WhatsApp AI] Blocked dangerous operation: ${operation}`);
            throw new Error(`Operation ${operation} is not allowed for security reasons.`);
          }
        }

        const startTime = Date.now();
        const result = await sqlEngine.executeRawSQL({
          query: params.query,
          organizationId,
        });
        const processingTime = Date.now() - startTime;

        // Handle successful execution
        if (result.success) {
          // Log the database query execution
          await loggingService.logDatabaseQuery(
            staffId,
            organizationId,
            fromPhoneNumber,
            params.query,
            result.data,
            processingTime
          );

          // Different logging for different operation types
          if (queryUpper.startsWith("SELECT")) {
            logger.info(
              `[WhatsApp AI] SELECT query returned ${
                Array.isArray(result.data) ? result.data.length : "non-array"
              } results`
            );
          } else if (queryUpper.startsWith("INSERT")) {
            logger.info(`[WhatsApp AI] INSERT operation completed successfully`);
          } else if (queryUpper.startsWith("UPDATE")) {
            logger.info(`[WhatsApp AI] UPDATE operation completed successfully`);
          }

          return result.data;
        }

        // Handle SQL error with retry logic
        if (!result.success && result.error) {
          const error = result.error;
          logger.warn(`[WhatsApp AI] SQL error (${error.type}): ${error.message}`);

          // Log the failed query attempt
          await loggingService.logError(
            staffId,
            organizationId,
            fromPhoneNumber,
            `SQL Error (attempt ${retryAttempt + 1}): ${error.message}`,
            error,
            "sql_execution_error"
          );

          // If we've reached max retries, throw the error
          if (retryAttempt >= maxRetries) {
            logger.error(`[WhatsApp AI] Max SQL retries (${maxRetries}) exceeded. Final error: ${error.message}`);
            throw new Error(
              `SQL query failed after ${maxRetries + 1} attempts. Last error: ${error.message}${
                error.suggestion ? ` Suggestion: ${error.suggestion}` : ""
              }`
            );
          }

          // Generate error feedback for AI to self-correct
          const errorFeedback = generateSQLErrorFeedback(error, params.query, retryAttempt);
          logger.info(`[WhatsApp AI] SQL error feedback generated for retry: ${errorFeedback}`);

          // Return error feedback so AI can try to fix the query
          return {
            error: true,
            errorType: error.type,
            errorMessage: error.message,
            suggestion: error.suggestion,
            feedback: errorFeedback,
            failedQuery: params.query,
            retryAttempt: retryAttempt + 1,
            instructions:
              "The SQL query failed. Please analyze the error and rewrite the query to fix the issue. Call this tool again with the corrected query and include retryAttempt and previousError parameters.",
          };
        }

        // Fallback error
        throw new Error("Unknown SQL execution error occurred");
      },
    },
    askClarification: {
      description: SQL_TOOL_DESCRIPTION.askClarification,
      parameters: z.object({
        question: z.string().describe("The clarification question to ask the user"),
        context: z.string().optional().describe("Additional context about why clarification is needed"),
      }),
      execute: async (params: any) => {
        logger.info(`[WhatsApp AI] Asking clarification: ${params.question}`);
        return {
          clarificationAsked: true,
          question: params.question,
          context: params.context || "",
        };
      },
    },
    ...donorAnalysisTool,
  };
}
