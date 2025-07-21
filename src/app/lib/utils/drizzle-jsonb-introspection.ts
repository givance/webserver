/**
 * Utility to extract JSONB type information from Drizzle schemas at runtime
 *
 * Note: Drizzle's $type<T>() method only provides compile-time type information.
 * This utility demonstrates how to work with JSONB columns and their types.
 */

import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

// Type definitions for JSONB column metadata
export interface JsonbColumnInfo {
  name: string;
  dataType: string;
  hasTypeAnnotation: boolean;
  defaultValue?: any;
  isNullable: boolean;
}

/**
 * Extract information about JSONB columns from a Drizzle table
 *
 * @param table - Drizzle PgTable instance
 * @returns Array of JSONB column information
 */
export function getJsonbColumns(table: PgTable<any>): JsonbColumnInfo[] {
  const columns = getTableColumns(table);
  const jsonbColumns: JsonbColumnInfo[] = [];

  for (const [columnName, column] of Object.entries(columns)) {
    // Check if this is a JSONB column
    if (column.dataType === 'json') {
      jsonbColumns.push({
        name: columnName,
        dataType: column.dataType,
        hasTypeAnnotation: !!column.dataType, // In practice, we can't detect $type usage at runtime
        defaultValue: column.default,
        isNullable: !column.notNull,
      });
    }
  }

  return jsonbColumns;
}

/**
 * Get a human-readable description of a table's JSONB columns
 *
 * @param table - Drizzle PgTable instance
 * @param tableName - Name of the table for documentation
 * @returns String description of JSONB columns
 */
export function describeJsonbColumns(table: PgTable<any>, tableName: string): string {
  const jsonbColumns = getJsonbColumns(table);

  if (jsonbColumns.length === 0) {
    return `Table '${tableName}' has no JSONB columns.`;
  }

  let description = `Table '${tableName}' JSONB columns:\n`;

  for (const column of jsonbColumns) {
    description += `\n- ${column.name}:\n`;
    description += `  Data Type: ${column.dataType}\n`;
    description += `  Nullable: ${column.isNullable ? 'Yes' : 'No'}\n`;
    if (column.defaultValue !== undefined) {
      description += `  Default: ${JSON.stringify(column.defaultValue)}\n`;
    }
  }

  return description;
}

/**
 * Type-safe wrapper for JSONB column types
 * This demonstrates how to work with JSONB types in a type-safe manner
 */
export type JsonbType<T> = T;

/**
 * Example usage with known JSONB type definitions
 * Since we can't extract types at runtime, we need to maintain a registry
 */
export const JSONB_TYPE_REGISTRY = {
  // Campaign tables
  'email_generation_sessions.chat_history': 'Array<ChatMessage>',
  'email_generation_sessions.selected_donor_ids': 'number[]',
  'email_generation_sessions.preview_donor_ids': 'number[]',
  'email_generation_sessions.schedule_config': `{
    dailyLimit?: number;
    minGapMinutes?: number;
    maxGapMinutes?: number;
    timezone?: string;
    allowedDays?: number[];
    allowedStartTime?: string;
    allowedEndTime?: string;
    allowedTimezone?: string;
    dailySchedules?: {
      [key: number]: {
        startTime: string;
        endTime: string;
        enabled: boolean;
      };
    };
  }`,

  // Generated emails
  'generated_emails.structured_content': 'Array<EmailPiece>',
  'generated_emails.reference_contexts': 'Record<string, any>',

  // Donors
  'donors.notes': 'DonorNote[]',
  'donors.predicted_actions': 'any', // Type not specified in schema

  // Organizations
  'organizations.donor_journey': `{
    nodes: DonorJourneyNode[];
    edges: DonorJourneyEdge[];
  }`,
  'organizations.memories': 'string[]',

  // Email schedules
  'organization_email_schedules.allowed_days': 'number[]',
  'organization_email_schedules.daily_schedules': `{
    [key: number]: {
      startTime: string;
      endTime: string;
      enabled: boolean;
    };
  }`,

  // Research
  'person_research_requests.search_results': 'any[]',
  'person_research_results.raw_data': 'any',
  'person_research_results.structured_data': 'any',

  // Smart email
  'smart_email_sessions.conversation_history': `Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>`,
  'smart_email_sessions.conflict_resolution_history': `Array<{
    conflict: string;
    resolution: string;
    timestamp: string;
  }>`,
  'smart_email_sessions.metadata': 'Record<string, any>',

  // Templates
  'templates.variables': 'Array<{ key: string; description: string }>',

  // WhatsApp
  'whatsapp_conversations.messages': `Array<{
    id: string;
    from: string;
    timestamp: string;
    text?: string;
    type: string;
  }>`,
  'whatsapp_conversations.context': 'any',
  'whatsapp_activity_logs.metadata': 'Record<string, any>',
} as const;

/**
 * Get the TypeScript type definition for a JSONB column
 *
 * @param tableName - Name of the table
 * @param columnName - Name of the JSONB column
 * @returns TypeScript type definition as a string, or null if not found
 */
export function getJsonbTypeDefinition(tableName: string, columnName: string): string | null {
  const key = `${tableName}.${columnName}`;
  return JSONB_TYPE_REGISTRY[key as keyof typeof JSONB_TYPE_REGISTRY] || null;
}

/**
 * Generate documentation for all JSONB columns in the schema
 *
 * @returns Markdown-formatted documentation
 */
export function generateJsonbDocumentation(): string {
  let doc = '# JSONB Column Types\n\n';

  const groupedByTable: Record<string, Array<{ column: string; type: string }>> = {};

  for (const [key, type] of Object.entries(JSONB_TYPE_REGISTRY)) {
    const [table, column] = key.split('.');
    if (!groupedByTable[table]) {
      groupedByTable[table] = [];
    }
    groupedByTable[table].push({ column, type });
  }

  for (const [table, columns] of Object.entries(groupedByTable)) {
    doc += `## ${table}\n\n`;
    for (const { column, type } of columns) {
      doc += `### ${column}\n\n`;
      doc += '```typescript\n';
      doc += type + '\n';
      doc += '```\n\n';
    }
  }

  return doc;
}
