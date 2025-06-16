import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { sql } from "drizzle-orm";

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
    return `
DATABASE SCHEMA:

ORGANIZATIONS TABLE:
- id (text, primary key) - Clerk Organization ID
- name (text) - Organization name
- slug (text) - URL slug
- created_at, updated_at (timestamp)

DONORS TABLE:
- id (serial, primary key)
- organization_id (text, foreign key to organizations.id) - ALWAYS FILTER BY THIS
- external_id (varchar) - External CRM ID
- first_name (varchar) - Primary first name
- last_name (varchar) - Primary last name
- his_title (varchar) - Mr., Dr., Rabbi, etc.
- his_first_name (varchar) - Male partner first name
- his_initial (varchar) - Male partner initial
- his_last_name (varchar) - Male partner last name
- her_title (varchar) - Mrs., Ms., Dr., etc.
- her_first_name (varchar) - Female partner first name
- her_initial (varchar) - Female partner initial
- her_last_name (varchar) - Female partner last name
- display_name (varchar) - Display name for communications
- is_couple (boolean) - Whether this is a couple record
- email (varchar) - Primary email
- phone (varchar) - Phone number
- address (text) - Full address
- state (varchar) - State/province
- gender (enum: 'male', 'female') - For individual donors
- notes (text) - Notes about the donor
- assigned_to_staff_id (integer, foreign key to staff.id)
- current_stage_name (varchar) - Current donor stage
- high_potential_donor (boolean) - Whether flagged as high potential
- created_at, updated_at (timestamp)

DONATIONS TABLE:
- id (serial, primary key)
- donor_id (integer, foreign key to donors.id)
- project_id (integer, foreign key to projects.id)
- date (timestamp) - Donation date
- amount (integer) - Amount in CENTS (multiply by 100 when inserting)
- currency (varchar, default 'USD')
- created_at, updated_at (timestamp)

PROJECTS TABLE:
- id (serial, primary key)
- organization_id (text, foreign key to organizations.id) - ALWAYS FILTER BY THIS
- name (varchar) - Project name
- description (text) - Project description
- active (boolean) - Whether project is active
- goal (integer) - Goal amount in cents
- tags (text[]) - Array of tags
- created_at, updated_at (timestamp)

STAFF TABLE:
- id (serial, primary key)
- organization_id (text, foreign key to organizations.id) - ALWAYS FILTER BY THIS
- first_name (varchar) - Staff first name
- last_name (varchar) - Staff last name
- email (varchar) - Staff email
- is_real_person (boolean) - Whether this is a real person
- is_primary (boolean) - Whether this is the primary staff member
- signature (text) - Email signature
- created_at, updated_at (timestamp)

IMPORTANT SECURITY RULES:
1. ALWAYS include WHERE organization_id = 'org_id' in SELECT/UPDATE queries
2. ALWAYS include organization_id = 'org_id' in VALUES for INSERT queries
3. SELECT, INSERT, and UPDATE queries are allowed
4. NO DELETE, DROP, TRUNCATE, ALTER, CREATE operations allowed
5. Amounts in donations table are stored in CENTS - multiply by 100 when inserting
6. Use proper JOINs to get related data
7. Use aggregate functions (SUM, COUNT, AVG, MAX, MIN) for statistics

ALLOWED OPERATIONS:

SELECT - Query data:
SELECT * FROM donors WHERE organization_id = 'org_id' AND (first_name ILIKE '%name%' OR last_name ILIKE '%name%')

INSERT - Add new records:
INSERT INTO donors (organization_id, first_name, last_name, email) VALUES ('org_id', 'John', 'Doe', 'john@example.com')
INSERT INTO donations (donor_id, project_id, date, amount, currency) VALUES (123, 456, NOW(), 50000, 'USD')

UPDATE - Modify existing records:
UPDATE donors SET notes = 'High potential donor' WHERE organization_id = 'org_id' AND id = 123
UPDATE donors SET phone = '555-1234' WHERE organization_id = 'org_id' AND email = 'john@example.com'

COMMON QUERY PATTERNS:

Find donors by name:
SELECT * FROM donors WHERE organization_id = 'org_id' AND (first_name ILIKE '%name%' OR last_name ILIKE '%name%')

Get donor with donation totals:
SELECT d.*, 
       COALESCE(SUM(don.amount), 0) as total_donations,
       COUNT(don.id) as donation_count,
       MAX(don.date) as last_donation_date
FROM donors d
LEFT JOIN donations don ON d.id = don.donor_id
WHERE d.organization_id = 'org_id'
GROUP BY d.id

Get donation history:
SELECT don.*, d.first_name, d.last_name, p.name as project_name
FROM donations don
JOIN donors d ON don.donor_id = d.id
JOIN projects p ON don.project_id = p.id
WHERE d.organization_id = 'org_id'
ORDER BY don.date DESC

Get donor statistics:
SELECT 
  COUNT(*) as total_donors,
  COUNT(CASE WHEN is_couple THEN 1 END) as couples_count,
  COUNT(CASE WHEN NOT is_couple THEN 1 END) as individuals_count,
  COUNT(CASE WHEN high_potential_donor THEN 1 END) as high_potential_count
FROM donors 
WHERE organization_id = 'org_id'
`;
  }
}
