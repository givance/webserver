/**
 * Example of how to use the JSONB introspection utilities
 * This demonstrates runtime inspection of Drizzle schema
 */

import { getTableColumns } from 'drizzle-orm';
import * as schema from '@/app/lib/db/schema';
import {
  getJsonbColumns,
  describeJsonbColumns,
  getJsonbTypeDefinition,
} from './drizzle-jsonb-introspection';

/**
 * Example: Inspect all tables in the schema for JSONB columns
 */
export function inspectAllJsonbColumns() {
  const results: Record<string, any> = {};

  // Get all exported table objects from schema
  const tables = Object.entries(schema).filter(([key, value]) => {
    // Filter to only get table objects (they have specific properties)
    return value && typeof value === 'object' && 'name' in value;
  });

  for (const [tableName, table] of tables) {
    try {
      const columns = getTableColumns(table as any);
      const jsonbCols = getJsonbColumns(table as any);

      if (jsonbCols.length > 0) {
        results[tableName] = {
          columns: jsonbCols,
          description: describeJsonbColumns(table as any, tableName),
          types: jsonbCols.map((col) => ({
            column: col.name,
            typeDefinition: getJsonbTypeDefinition(tableName, col.name),
          })),
        };
      }
    } catch (error) {
      // Skip non-table exports
      continue;
    }
  }

  return results;
}

/**
 * Example: Get runtime information about a specific table's JSONB columns
 */
export function inspectDonorsJsonb() {
  const columns = getTableColumns(schema.donors);
  const jsonbColumns = getJsonbColumns(schema.donors);

  console.log('Donors table JSONB columns:', jsonbColumns);

  // Get type definitions
  for (const col of jsonbColumns) {
    const typeDef = getJsonbTypeDefinition('donors', col.name);
    console.log(`Type for donors.${col.name}:`, typeDef);
  }

  return {
    columns: jsonbColumns,
    typeDefinitions: jsonbColumns.map((col) => ({
      column: col.name,
      type: getJsonbTypeDefinition('donors', col.name),
    })),
  };
}

/**
 * Example: Generate API documentation for JSONB columns
 */
export function generateApiDocsForJsonb() {
  const inspection = inspectAllJsonbColumns();

  let apiDocs = '# API JSONB Field Documentation\n\n';

  for (const [tableName, info] of Object.entries(inspection)) {
    apiDocs += `## ${tableName}\n\n`;

    for (const typeInfo of info.types) {
      if (typeInfo.typeDefinition) {
        apiDocs += `### ${typeInfo.column}\n\n`;
        apiDocs += 'Type:\n```typescript\n';
        apiDocs += typeInfo.typeDefinition + '\n';
        apiDocs += '```\n\n';
      }
    }
  }

  return apiDocs;
}

/**
 * Runtime type guards for JSONB data
 */
export const JsonbTypeGuards = {
  isDonorNote: (value: any): value is schema.DonorNote => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'date' in value &&
      'note' in value &&
      typeof value.date === 'string' &&
      typeof value.note === 'string'
    );
  },

  isDonorNoteArray: (value: any): value is schema.DonorNote[] => {
    return Array.isArray(value) && value.every(JsonbTypeGuards.isDonorNote);
  },

  isScheduleConfig: (value: any): value is any => {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value.dailyLimit === undefined || typeof value.dailyLimit === 'number') &&
      (value.timezone === undefined || typeof value.timezone === 'string')
    );
  },
};

/**
 * Example: Validate JSONB data at runtime
 */
export function validateJsonbData(tableName: string, columnName: string, data: any): boolean {
  const key = `${tableName}.${columnName}`;

  // Map table.column to validation function
  const validators: Record<string, (data: any) => boolean> = {
    'donors.notes': JsonbTypeGuards.isDonorNoteArray,
    'email_generation_sessions.schedule_config': JsonbTypeGuards.isScheduleConfig,
    // Add more validators as needed
  };

  const validator = validators[key];
  return validator ? validator(data) : true;
}
