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

    // Block dangerous operations
    const dangerousPatterns = [
      /\bdrop\s+table\b/i,
      /\bdrop\s+database\b/i,
      /\btruncate\b/i,
      /\bdelete\s+from\b/i,
      /\bupdate\s+\w+\s+set\b/i,
      /\binsert\s+into\b/i,
      /\balter\s+table\b/i,
      /\bcreate\s+table\b/i,
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

    // Must include organization filter for security
    if (!normalizedQuery.includes("organization_id")) {
      throw new Error("Query must include organization_id filter for security");
    }
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
- amount (integer) - Amount in CENTS (divide by 100 for dollars)
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
1. ALWAYS include WHERE organization_id = 'org_id' in your queries
2. Only SELECT queries are allowed - no INSERT, UPDATE, DELETE, DROP, etc.
3. Amounts in donations table are stored in CENTS - divide by 100 for dollar amounts
4. Use proper JOINs to get related data
5. Use aggregate functions (SUM, COUNT, AVG, MAX, MIN) for statistics

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
