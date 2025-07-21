import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';
import { sql } from 'drizzle-orm';
import * as schema from '@/app/lib/db/schema';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { getJsonbTypeDefinition } from '@/app/lib/utils/drizzle-jsonb-introspection';

/**
 * Result object for SQL execution
 */
export interface SQLExecutionResult {
  success: boolean;
  data?: any[];
  error?: {
    message: string;
    type: 'syntax' | 'security' | 'runtime' | 'unknown';
    query: string;
    suggestion?: string;
  };
}

/**
 * SQL Engine Service that allows AI to write and execute raw SQL queries
 * This provides maximum flexibility for database operations
 */
export class WhatsAppSQLEngineService {
  /**
   * Execute a raw SQL query against the database
   * Returns result object instead of throwing errors to allow AI error recovery
   */
  async executeRawSQL(params: {
    query: string;
    organizationId: string;
  }): Promise<SQLExecutionResult> {
    const { query: rawQuery, organizationId } = params;

    logger.info(`[SQL Engine] Executing raw SQL query`, {
      organizationId,
      queryLength: rawQuery.length,
      queryType: rawQuery.trim().split(' ')[0].toUpperCase(),
      query: rawQuery,
    });

    try {
      // Basic security checks
      this.validateSQLQuery(rawQuery);

      // Execute the raw SQL query
      const startTime = Date.now();
      const result = await db.execute(sql.raw(rawQuery));
      const executionTime = Date.now() - startTime;

      // Convert QueryResult to array
      const rows = Array.isArray(result) ? result : result.rows || [];

      logger.info(`[SQL Engine] Query executed successfully`, {
        organizationId,
        rowsReturned: rows.length,
        executionTimeMs: executionTime,
        queryType: rawQuery.trim().split(' ')[0].toUpperCase(),
      });
      return {
        success: true,
        data: rows,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Classify error type for better AI understanding
      const errorType = this.classifyError(errorMessage);
      const suggestion = this.generateErrorSuggestion(errorMessage, rawQuery);

      logger.error(`[SQL Engine] SQL query execution failed`, {
        error: errorMessage,
        errorType,
        organizationId,
        query: rawQuery,
        suggestion,
      });

      return {
        success: false,
        error: {
          message: errorMessage,
          type: errorType,
          query: rawQuery,
          suggestion,
        },
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use executeRawSQL instead for better error handling
   */
  async executeRawSQLLegacy(params: { query: string; organizationId: string }): Promise<any[]> {
    const result = await this.executeRawSQL(params);
    if (!result.success) {
      throw new Error(`SQL execution failed: ${result.error?.message}`);
    }
    return result.data || [];
  }

  /**
   * Classify error type to help AI understand what went wrong
   */
  private classifyError(errorMessage: string): 'syntax' | 'security' | 'runtime' | 'unknown' {
    const message = errorMessage.toLowerCase();

    if (
      message.includes('syntax error') ||
      message.includes('unexpected token') ||
      message.includes('parse error') ||
      message.includes('at or near')
    ) {
      return 'syntax';
    }

    if (
      message.includes('dangerous') ||
      message.includes('not allowed') ||
      message.includes('organization_id')
    ) {
      return 'security';
    }

    if (
      (message.includes('relation') && message.includes('does not exist')) ||
      (message.includes('column') && message.includes('does not exist')) ||
      message.includes('constraint') ||
      message.includes('duplicate key') ||
      message.includes('foreign key')
    ) {
      return 'runtime';
    }

    return 'unknown';
  }

  /**
   * Generate helpful suggestions for common SQL errors
   */
  private generateErrorSuggestion(errorMessage: string, query: string): string | undefined {
    const message = errorMessage.toLowerCase();
    const queryLower = query.toLowerCase();

    // Syntax error suggestions
    if (message.includes('syntax error at or near')) {
      const nearMatch = message.match(/syntax error at or near "([^"]+)"/);
      if (nearMatch) {
        const problemChar = nearMatch[1];
        return `Check the SQL syntax near "${problemChar}". Common issues: missing quotes, parentheses, or semicolon.`;
      }
    }

    // Missing organization_id suggestions
    if (message.includes('organization_id')) {
      if (queryLower.includes('select') || queryLower.includes('update')) {
        return `Add WHERE organization_id = 'your_org_id' to the query for security compliance.`;
      }
      if (queryLower.includes('insert')) {
        return `Include organization_id in the INSERT VALUES clause.`;
      }
    }

    // Table/column not found suggestions
    if (message.includes('does not exist')) {
      return `Check the table/column name spelling. Available tables: donors, donations, projects, staff, organizations.`;
    }

    // Quote-related issues
    if (message.includes('unterminated quoted string') || message.includes('quoted identifier')) {
      return `Check for unmatched quotes in string values. Use single quotes for string literals.`;
    }

    return undefined;
  }

  /**
   * Basic SQL validation to prevent dangerous operations
   */
  private validateSQLQuery(query: string): void {
    const normalizedQuery = query.toLowerCase().trim();

    // Block only truly dangerous operations - allow INSERT and UPDATE
    const dangerousPatterns = [
      /\bdrop\s+table\b/i,
      /\bdrop\s+database\b/i,
      /\btruncate\b/i,
      /\bdelete\s+from\b/i,
      /\balter\s+table\b/i,
      /\bcreate\s+table\b/i,
      /\bcreate\s+database\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\b--\b/,
      /\/\*/,
      /\*\//,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalizedQuery)) {
        throw new Error(`Dangerous SQL operation detected: ${pattern.source}`);
      }
    }

    // Smart organization_id validation
    this.validateOrganizationFilter(normalizedQuery);
  }

  /**
   * Validate that queries properly filter by organization for security
   */
  private validateOrganizationFilter(query: string): void {
    // Tables that have direct organization_id columns
    const tablesWithDirectOrgId = ['donors', 'projects', 'staff', 'organizations'];

    // Tables that are secured through foreign key relationships
    const tablesWithIndirectOrgId = ['donations']; // secured through donor_id -> donors.organization_id

    // Check if query mentions organization_id directly (good for most cases)
    if (query.includes('organization_id')) {
      return; // Query includes organization filter, we're good
    }

    // For INSERT statements into tables that don't have direct organization_id
    if (query.startsWith('insert into')) {
      // Extract table name from INSERT statement
      const insertMatch = query.match(/insert\s+into\s+(\w+)/i);
      if (insertMatch) {
        const tableName = insertMatch[1].toLowerCase();

        // Allow INSERT into tables that are secured through foreign keys
        if (tablesWithIndirectOrgId.includes(tableName)) {
          return; // Allow donation inserts - they're secured through donor_id
        }

        // For tables with direct organization_id, require it in the INSERT
        if (tablesWithDirectOrgId.includes(tableName)) {
          throw new Error(
            'INSERT queries into tables with organization_id must include organization_id in VALUES'
          );
        }
      }
    }

    // For SELECT/UPDATE on tables with direct organization_id, require the filter
    const selectUpdateMatch = query.match(/(?:select|update)\s+.*?(?:from|update)\s+(\w+)/i);
    if (selectUpdateMatch) {
      const tableName = selectUpdateMatch[1].toLowerCase();

      if (tablesWithDirectOrgId.includes(tableName)) {
        throw new Error(
          'SELECT/UPDATE queries on tables with organization_id must include WHERE organization_id filter'
        );
      }

      // For tables with indirect organization_id, allow them (they'll be JOINed properly)
      if (tablesWithIndirectOrgId.includes(tableName)) {
        return; // Allow - these are secured through JOINs
      }
    }

    // If we get here and no organization_id was found, it's likely a complex query
    // that might be properly secured through JOINs, so we'll allow it
    // The foreign key constraints will ensure data integrity
  }

  /**
   * Get the complete database schema for AI context
   */
  getSchemaDescription(): string {
    return this.generateSchemaFromTables();
  }

  /**
   * Dynamically generate schema description from the actual schema definitions
   */
  private generateSchemaFromTables(): string {
    const schemaDescription = ['DATABASE SCHEMA:\n'];

    // Get only the core tables needed for WhatsApp queries
    const tables = [
      { name: 'ORGANIZATIONS', table: schema.organizations, tableName: 'organizations' },
      { name: 'DONORS', table: schema.donors, tableName: 'donors' },
      { name: 'DONATIONS', table: schema.donations, tableName: 'donations' },
      { name: 'PROJECTS', table: schema.projects, tableName: 'projects' },
      { name: 'STAFF', table: schema.staff, tableName: 'staff' },
    ];

    for (const { name, table, tableName } of tables) {
      try {
        const tableConfig = getTableConfig(table);
        schemaDescription.push(`${name} TABLE:`);

        // Extract column information
        for (const [columnName, column] of Object.entries(tableConfig.columns)) {
          let columnDescription = `- ${column.name}`;

          // Add data type information
          if (column.dataType) {
            columnDescription += ` (${column.dataType}`;

            // Check if it's a primary key
            if (column.primary) {
              columnDescription += ', primary key';
            }

            columnDescription += ')';
          }

          // Add JSONB type information from registry
          if (column.dataType === 'json') {
            const typeDefinition = getJsonbTypeDefinition(tableName, column.name);
            if (typeDefinition) {
              // Extract just the essential type info for the DonorNote case
              if (tableName === 'donors' && column.name === 'notes') {
                columnDescription +=
                  ' - Array of note objects with structure: {createdAt: string (ISO date), createdBy: string (user ID), content: string}';
              } else {
                columnDescription += ` - Type: ${typeDefinition}`;
              }
            }
          }

          schemaDescription.push(columnDescription);
        }

        schemaDescription.push(''); // Add empty line between tables
      } catch (error) {
        logger.warn(
          `[SQL Engine] Could not extract schema for table ${name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue with next table
      }
    }

    // Add detailed JSONB field documentation
    schemaDescription.push('IMPORTANT JSONB FIELD STRUCTURES:');
    schemaDescription.push('');
    schemaDescription.push('donors.notes - Array of DonorNote objects:');
    schemaDescription.push('  Each note object MUST have these exact fields:');
    schemaDescription.push('  - createdAt: ISO timestamp string (use NOW() for current time)');
    schemaDescription.push(
      "  - createdBy: User ID string who created the note (use 'system' for WhatsApp notes)"
    );
    schemaDescription.push('  - content: The actual note text');
    schemaDescription.push('');
    schemaDescription.push('  Example for adding a note:');
    schemaDescription.push("  UPDATE donors SET notes = COALESCE(notes, '[]'::jsonb) || ");
    schemaDescription.push(
      "  jsonb_build_array(jsonb_build_object('createdAt', NOW(), 'createdBy', 'system', 'content', 'Met with donor'))"
    );
    schemaDescription.push("  WHERE organization_id = '...' AND id = 123");
    schemaDescription.push('');

    return schemaDescription.join('\n');
  }
}
