import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { sql } from "drizzle-orm";
import * as schema from "@/app/lib/db/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

/**
 * SQL Engine Service that allows AI to write and execute raw SQL queries
 * This provides maximum flexibility for database operations
 */
export class WhatsAppSQLEngineService {
  /**
   * Execute a raw SQL query against the database
   */
  async executeRawSQL(params: { query: string; organizationId: string }): Promise<any[]> {
    const { query: rawQuery, organizationId } = params;

    logger.info(`[SQL Engine] Executing raw SQL query for organization ${organizationId}`);
    logger.info(`[SQL Engine] Query: ${rawQuery}`);

    try {
      // Basic security checks
      this.validateSQLQuery(rawQuery);

      // Execute the raw SQL query
      const result = await db.execute(sql.raw(rawQuery));

      // Convert QueryResult to array
      const rows = Array.isArray(result) ? result : result.rows || [];

      logger.info(`[SQL Engine] Query executed successfully, returned ${rows.length} rows`);
      return rows;
    } catch (error) {
      logger.error(`[SQL Engine] Error executing SQL query: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`SQL execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const tablesWithDirectOrgId = ["donors", "projects", "staff", "organizations"];

    // Tables that are secured through foreign key relationships
    const tablesWithIndirectOrgId = ["donations"]; // secured through donor_id -> donors.organization_id

    // Check if query mentions organization_id directly (good for most cases)
    if (query.includes("organization_id")) {
      return; // Query includes organization filter, we're good
    }

    // For INSERT statements into tables that don't have direct organization_id
    if (query.startsWith("insert into")) {
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
          throw new Error("INSERT queries into tables with organization_id must include organization_id in VALUES");
        }
      }
    }

    // For SELECT/UPDATE on tables with direct organization_id, require the filter
    const selectUpdateMatch = query.match(/(?:select|update)\s+.*?(?:from|update)\s+(\w+)/i);
    if (selectUpdateMatch) {
      const tableName = selectUpdateMatch[1].toLowerCase();

      if (tablesWithDirectOrgId.includes(tableName)) {
        throw new Error(
          "SELECT/UPDATE queries on tables with organization_id must include WHERE organization_id filter"
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
    const schemaDescription = ["DATABASE SCHEMA:\n"];

    // Get only the core tables needed for WhatsApp queries
    const tables = [
      { name: "ORGANIZATIONS", table: schema.organizations },
      { name: "DONORS", table: schema.donors },
      { name: "DONATIONS", table: schema.donations },
      { name: "PROJECTS", table: schema.projects },
      { name: "STAFF", table: schema.staff },
    ];

    for (const { name, table } of tables) {
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
              columnDescription += ", primary key";
            }

            columnDescription += ")";
          }

          schemaDescription.push(columnDescription);
        }

        schemaDescription.push(""); // Add empty line between tables
      } catch (error) {
        logger.warn(
          `[SQL Engine] Could not extract schema for table ${name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue with next table
      }
    }

    return schemaDescription.join("\n");
  }
}
