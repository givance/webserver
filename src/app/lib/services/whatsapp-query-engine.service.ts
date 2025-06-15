import { db } from "@/app/lib/db";
import { donors, donations, projects, staff } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { and, desc, eq, ilike, or, sql, sum, gte, lte, between, asc, count, max, min, avg } from "drizzle-orm";
import { z } from "zod";

/**
 * Ultra-flexible query engine that can handle almost any database query request
 * This replaces the rigid pre-defined tools with a flexible, type-safe query system
 */

// Define flexible query operations
type QueryOperation =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "between"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null";

// Flexible filter interface
interface QueryFilter {
  field: string;
  operation: QueryOperation;
  value?: any;
  values?: any[]; // For 'in', 'not_in', 'between' operations
}

// Main query interface - simplified to handle common patterns
interface FlexibleQueryParams {
  // Query type - determines the structure
  queryType:
    | "findDonors"
    | "findDonations"
    | "findProjects"
    | "findStaff"
    | "donorDetails"
    | "donationHistory"
    | "donorStats"
    | "projectStats";

  // Filters to apply
  filters?: QueryFilter[];

  // Sorting field and direction
  sortBy?: string;
  sortDirection?: "asc" | "desc";

  // Limit results
  limit?: number;

  // Organization ID (always required)
  organizationId: string;
}

// Zod schema for runtime validation
const FlexibleQueryZodSchema = z.object({
  queryType: z.enum([
    "findDonors",
    "findDonations",
    "findProjects",
    "findStaff",
    "donorDetails",
    "donationHistory",
    "donorStats",
    "projectStats",
  ]),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operation: z.enum([
          "equals",
          "not_equals",
          "contains",
          "starts_with",
          "ends_with",
          "greater_than",
          "less_than",
          "greater_than_or_equal",
          "less_than_or_equal",
          "between",
          "in",
          "not_in",
          "is_null",
          "is_not_null",
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
    )
    .optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  limit: z.number().optional(),
  organizationId: z.string(),
});

// JSON Schema for OpenAI Function Calling - manually crafted to avoid schema conversion issues
export const FlexibleQuerySchema = {
  type: "object",
  properties: {
    queryType: {
      type: "string",
      enum: [
        "findDonors",
        "findDonations",
        "findProjects",
        "findStaff",
        "donorDetails",
        "donationHistory",
        "donorStats",
        "projectStats",
      ],
    },
    filters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          operation: {
            type: "string",
            enum: [
              "equals",
              "not_equals",
              "contains",
              "starts_with",
              "ends_with",
              "greater_than",
              "less_than",
              "greater_than_or_equal",
              "less_than_or_equal",
              "between",
              "in",
              "not_in",
              "is_null",
              "is_not_null",
            ],
          },
          value: {},
          values: {
            type: "array",
            items: {},
          },
        },
        required: ["field", "operation"],
        additionalProperties: false,
      },
    },
    sortBy: { type: "string" },
    sortDirection: {
      type: "string",
      enum: ["asc", "desc"],
    },
    limit: { type: "number" },
    organizationId: { type: "string" },
  },
  required: ["queryType", "organizationId"],
  additionalProperties: false,
  $schema: "http://json-schema.org/draft-07/schema#",
} as const;

export class WhatsAppQueryEngineService {
  /**
   * Execute a flexible database query
   */
  async executeFlexibleQuery(params: FlexibleQueryParams): Promise<any[]> {
    // Validate input parameters
    try {
      FlexibleQueryZodSchema.parse(params);
    } catch (error) {
      logger.error(
        `[Query Engine] Invalid query parameters: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(`Invalid query parameters: ${error instanceof Error ? error.message : String(error)}`);
    }

    const { queryType, filters = [], sortBy, sortDirection = "desc", limit = 100, organizationId } = params;

    logger.info(`[Query Engine] Executing flexible query type: ${queryType}`);
    logger.info(`[Query Engine] Filters: ${JSON.stringify(filters)}`);

    try {
      switch (queryType) {
        case "findDonors":
          return await this.findDonorsQuery(organizationId, filters, sortBy, sortDirection, limit);

        case "donorDetails":
          return await this.donorDetailsQuery(organizationId, filters, limit);

        case "findDonations":
          return await this.findDonationsQuery(organizationId, filters, sortBy, sortDirection, limit);

        case "donationHistory":
          return await this.donationHistoryQuery(organizationId, filters, sortBy, sortDirection, limit);

        case "findProjects":
          return await this.findProjectsQuery(organizationId, filters, sortBy, sortDirection, limit);

        case "findStaff":
          return await this.findStaffQuery(organizationId, filters, sortBy, sortDirection, limit);

        case "donorStats":
          return await this.donorStatsQuery(organizationId, filters);

        case "projectStats":
          return await this.projectStatsQuery(organizationId, filters);

        default:
          throw new Error(`Unsupported query type: ${queryType}`);
      }
    } catch (error) {
      logger.error(
        `[Query Engine] Error executing flexible query: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Find donors with aggregated donation statistics
   */
  private async findDonorsQuery(
    organizationId: string,
    filters: QueryFilter[],
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    limit: number = 100
  ): Promise<any[]> {
    const whereConditions = [eq(donors.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildDonorFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const query = db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        displayName: donors.displayName,
        email: donors.email,
        phone: donors.phone,
        address: donors.address,
        state: donors.state,
        isCouple: donors.isCouple,
        highPotentialDonor: donors.highPotentialDonor,
        currentStageName: donors.currentStageName,
        assignedToStaffId: donors.assignedToStaffId,
        notes: donors.notes,
        createdAt: donors.createdAt,
        updatedAt: donors.updatedAt,
        totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        donationCount: sql<number>`COUNT(${donations.id})`,
        lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
        averageDonation: sql<number>`CASE WHEN COUNT(${donations.id}) > 0 THEN COALESCE(SUM(${donations.amount}), 0) / COUNT(${donations.id}) ELSE 0 END`,
      })
      .from(donors)
      .leftJoin(donations, eq(donors.id, donations.donorId))
      .where(and(...whereConditions))
      .groupBy(
        donors.id,
        donors.firstName,
        donors.lastName,
        donors.displayName,
        donors.email,
        donors.phone,
        donors.address,
        donors.state,
        donors.isCouple,
        donors.highPotentialDonor,
        donors.currentStageName,
        donors.assignedToStaffId,
        donors.notes,
        donors.createdAt,
        donors.updatedAt
      );

    // Apply sorting
    const sortedQuery = this.applySorting(query, sortBy, sortDirection, "donors");
    return await sortedQuery.limit(limit);
  }

  /**
   * Get detailed donor information with staff assignment
   */
  private async donorDetailsQuery(organizationId: string, filters: QueryFilter[], limit: number = 1): Promise<any[]> {
    const whereConditions = [eq(donors.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildDonorFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const query = db
      .select({
        id: donors.id,
        firstName: donors.firstName,
        lastName: donors.lastName,
        displayName: donors.displayName,
        email: donors.email,
        phone: donors.phone,
        address: donors.address,
        state: donors.state,
        isCouple: donors.isCouple,
        hisFirstName: donors.hisFirstName,
        hisLastName: donors.hisLastName,
        herFirstName: donors.herFirstName,
        herLastName: donors.herLastName,
        highPotentialDonor: donors.highPotentialDonor,
        currentStageName: donors.currentStageName,
        notes: donors.notes,
        createdAt: donors.createdAt,
        updatedAt: donors.updatedAt,
        staffId: staff.id,
        staffFirstName: staff.firstName,
        staffLastName: staff.lastName,
        staffEmail: staff.email,
        totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        donationCount: sql<number>`COUNT(${donations.id})`,
        lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
      })
      .from(donors)
      .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
      .leftJoin(donations, eq(donors.id, donations.donorId))
      .where(and(...whereConditions))
      .groupBy(
        donors.id,
        donors.firstName,
        donors.lastName,
        donors.displayName,
        donors.email,
        donors.phone,
        donors.address,
        donors.state,
        donors.isCouple,
        donors.hisFirstName,
        donors.hisLastName,
        donors.herFirstName,
        donors.herLastName,
        donors.highPotentialDonor,
        donors.currentStageName,
        donors.notes,
        donors.createdAt,
        donors.updatedAt,
        staff.id,
        staff.firstName,
        staff.lastName,
        staff.email
      );

    return await query.limit(limit);
  }

  /**
   * Find donations with donor and project information
   */
  private async findDonationsQuery(
    organizationId: string,
    filters: QueryFilter[],
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    limit: number = 100
  ): Promise<any[]> {
    const whereConditions = [eq(donors.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildDonationFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const query = db
      .select({
        id: donations.id,
        amount: donations.amount,
        currency: donations.currency,
        date: donations.date,
        donorId: donors.id,
        donorFirstName: donors.firstName,
        donorLastName: donors.lastName,
        donorDisplayName: donors.displayName,
        donorEmail: donors.email,
        projectId: projects.id,
        projectName: projects.name,
        projectDescription: projects.description,
      })
      .from(donations)
      .innerJoin(donors, eq(donations.donorId, donors.id))
      .innerJoin(projects, eq(donations.projectId, projects.id))
      .where(and(...whereConditions));

    // Apply sorting
    const sortedQuery = this.applySorting(query, sortBy, sortDirection, "donations");
    return await sortedQuery.limit(limit);
  }

  /**
   * Get donation history for specific donors
   */
  private async donationHistoryQuery(
    organizationId: string,
    filters: QueryFilter[],
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    limit: number = 100
  ): Promise<any[]> {
    return this.findDonationsQuery(organizationId, filters, sortBy || "date", sortDirection, limit);
  }

  /**
   * Find projects with donation statistics
   */
  private async findProjectsQuery(
    organizationId: string,
    filters: QueryFilter[],
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    limit: number = 100
  ): Promise<any[]> {
    const whereConditions = [eq(projects.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildProjectFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const query = db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        active: projects.active,
        goal: projects.goal,
        tags: projects.tags,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        totalDonations: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        donationCount: sql<number>`COUNT(${donations.id})`,
        donorCount: sql<number>`COUNT(DISTINCT ${donations.donorId})`,
        lastDonationDate: sql<Date | null>`MAX(${donations.date})`,
      })
      .from(projects)
      .leftJoin(donations, eq(projects.id, donations.projectId))
      .where(and(...whereConditions))
      .groupBy(
        projects.id,
        projects.name,
        projects.description,
        projects.active,
        projects.goal,
        projects.tags,
        projects.createdAt,
        projects.updatedAt
      );

    // Apply sorting
    const sortedQuery = this.applySorting(query, sortBy, sortDirection, "projects");
    return await sortedQuery.limit(limit);
  }

  /**
   * Find staff with assigned donor counts
   */
  private async findStaffQuery(
    organizationId: string,
    filters: QueryFilter[],
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    limit: number = 100
  ): Promise<any[]> {
    const whereConditions = [eq(staff.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildStaffFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const query = db
      .select({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        isRealPerson: staff.isRealPerson,
        isPrimary: staff.isPrimary,
        signature: staff.signature,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
        assignedDonorCount: sql<number>`COUNT(${donors.id})`,
      })
      .from(staff)
      .leftJoin(donors, eq(staff.id, donors.assignedToStaffId))
      .where(and(...whereConditions))
      .groupBy(
        staff.id,
        staff.firstName,
        staff.lastName,
        staff.email,
        staff.isRealPerson,
        staff.isPrimary,
        staff.signature,
        staff.createdAt,
        staff.updatedAt
      );

    // Apply sorting
    const sortedQuery = this.applySorting(query, sortBy, sortDirection, "staff");
    return await sortedQuery.limit(limit);
  }

  /**
   * Get overall donor statistics
   */
  private async donorStatsQuery(organizationId: string, filters: QueryFilter[]): Promise<any[]> {
    const whereConditions = [eq(donors.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildDonorFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const result = await db
      .select({
        totalDonors: sql<number>`COUNT(DISTINCT ${donors.id})`,
        totalDonations: sql<number>`COUNT(${donations.id})`,
        totalDonationAmount: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        averageDonationAmount: sql<number>`CASE WHEN COUNT(${donations.id}) > 0 THEN COALESCE(SUM(${donations.amount}), 0) / COUNT(${donations.id}) ELSE 0 END`,
        highPotentialDonors: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.highPotentialDonor} = true THEN ${donors.id} END)`,
        couplesCount: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.isCouple} = true THEN ${donors.id} END)`,
        individualsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${donors.isCouple} = false THEN ${donors.id} END)`,
      })
      .from(donors)
      .leftJoin(donations, eq(donors.id, donations.donorId))
      .where(and(...whereConditions));

    return result;
  }

  /**
   * Get overall project statistics
   */
  private async projectStatsQuery(organizationId: string, filters: QueryFilter[]): Promise<any[]> {
    const whereConditions = [eq(projects.organizationId, organizationId)];

    // Apply filters
    filters.forEach((filter) => {
      const condition = this.buildProjectFilterCondition(filter);
      if (condition) whereConditions.push(condition);
    });

    const result = await db
      .select({
        totalProjects: sql<number>`COUNT(DISTINCT ${projects.id})`,
        activeProjects: sql<number>`COUNT(DISTINCT CASE WHEN ${projects.active} = true THEN ${projects.id} END)`,
        totalDonations: sql<number>`COUNT(${donations.id})`,
        totalDonationAmount: sql<number>`COALESCE(SUM(${donations.amount}), 0)`,
        averageDonationAmount: sql<number>`CASE WHEN COUNT(${donations.id}) > 0 THEN COALESCE(SUM(${donations.amount}), 0) / COUNT(${donations.id}) ELSE 0 END`,
        totalGoalAmount: sql<number>`COALESCE(SUM(${projects.goal}), 0)`,
      })
      .from(projects)
      .leftJoin(donations, eq(projects.id, donations.projectId))
      .where(and(...whereConditions));

    return result;
  }

  /**
   * Apply sorting to a query based on context
   */
  private applySorting(
    query: any,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    context: string = "donors"
  ): any {
    if (!sortBy) {
      // Default sorting based on context
      switch (context) {
        case "donors":
          return query.orderBy(desc(sql`COALESCE(SUM(${donations.amount}), 0)`));
        case "donations":
          return query.orderBy(desc(donations.date));
        case "projects":
          return query.orderBy(desc(sql`COALESCE(SUM(${donations.amount}), 0)`));
        case "staff":
          return query.orderBy(desc(sql`COUNT(${donors.id})`));
        default:
          return query;
      }
    }

    const orderBy = sortDirection === "desc" ? desc : asc;

    switch (context) {
      case "donors":
        switch (sortBy) {
          case "totalDonations":
            return query.orderBy(orderBy(sql`COALESCE(SUM(${donations.amount}), 0)`));
          case "donationCount":
            return query.orderBy(orderBy(sql`COUNT(${donations.id})`));
          case "lastDonationDate":
            return query.orderBy(orderBy(sql`MAX(${donations.date})`));
          case "firstName":
            return query.orderBy(orderBy(donors.firstName));
          case "lastName":
            return query.orderBy(orderBy(donors.lastName));
          case "createdAt":
            return query.orderBy(orderBy(donors.createdAt));
          default:
            return query.orderBy(orderBy(donors.firstName));
        }
      case "donations":
        switch (sortBy) {
          case "amount":
            return query.orderBy(orderBy(donations.amount));
          case "date":
            return query.orderBy(orderBy(donations.date));
          case "donorName":
            return query.orderBy(orderBy(donors.firstName), orderBy(donors.lastName));
          case "projectName":
            return query.orderBy(orderBy(projects.name));
          default:
            return query.orderBy(orderBy(donations.date));
        }
      case "projects":
        switch (sortBy) {
          case "totalDonations":
            return query.orderBy(orderBy(sql`COALESCE(SUM(${donations.amount}), 0)`));
          case "donationCount":
            return query.orderBy(orderBy(sql`COUNT(${donations.id})`));
          case "donorCount":
            return query.orderBy(orderBy(sql`COUNT(DISTINCT ${donations.donorId})`));
          case "name":
            return query.orderBy(orderBy(projects.name));
          default:
            return query.orderBy(orderBy(projects.name));
        }
      case "staff":
        switch (sortBy) {
          case "assignedDonorCount":
            return query.orderBy(orderBy(sql`COUNT(${donors.id})`));
          case "firstName":
            return query.orderBy(orderBy(staff.firstName));
          case "lastName":
            return query.orderBy(orderBy(staff.lastName));
          default:
            return query.orderBy(orderBy(staff.firstName));
        }
      default:
        return query;
    }
  }

  /**
   * Build filter conditions for donor queries
   */
  private buildDonorFilterCondition(filter: QueryFilter): any {
    let field: any;

    switch (filter.field) {
      case "firstName":
        field = donors.firstName;
        break;
      case "lastName":
        field = donors.lastName;
        break;
      case "displayName":
        field = donors.displayName;
        break;
      case "email":
        field = donors.email;
        break;
      case "phone":
        field = donors.phone;
        break;
      case "address":
        field = donors.address;
        break;
      case "state":
        field = donors.state;
        break;
      case "notes":
        field = donors.notes;
        break;
      case "isCouple":
        field = donors.isCouple;
        break;
      case "highPotentialDonor":
        field = donors.highPotentialDonor;
        break;
      case "currentStageName":
        field = donors.currentStageName;
        break;
      case "id":
        field = donors.id;
        break;
      case "assignedToStaffId":
        field = donors.assignedToStaffId;
        break;
      case "createdAt":
        field = donors.createdAt;
        break;
      case "updatedAt":
        field = donors.updatedAt;
        break;
      case "name": // Special handling for combined name search
        return or(
          ilike(donors.firstName, `%${filter.value}%`),
          ilike(donors.lastName, `%${filter.value}%`),
          ilike(donors.displayName, `%${filter.value}%`),
          ilike(sql`CONCAT(${donors.firstName}, ' ', ${donors.lastName})`, `%${filter.value}%`)
        );
      default:
        return null;
    }

    return this.buildCondition(field, filter);
  }

  /**
   * Build filter conditions for donation queries
   */
  private buildDonationFilterCondition(filter: QueryFilter): any {
    let field: any;

    switch (filter.field) {
      case "amount":
        field = donations.amount;
        break;
      case "currency":
        field = donations.currency;
        break;
      case "date":
        field = donations.date;
        break;
      case "id":
        field = donations.id;
        break;
      case "donorId":
        field = donations.donorId;
        break;
      case "projectId":
        field = donations.projectId;
        break;
      case "donorFirstName":
        field = donors.firstName;
        break;
      case "donorLastName":
        field = donors.lastName;
        break;
      case "donorEmail":
        field = donors.email;
        break;
      case "projectName":
        field = projects.name;
        break;
      case "donorName": // Special handling for combined donor name search
        return or(
          ilike(donors.firstName, `%${filter.value}%`),
          ilike(donors.lastName, `%${filter.value}%`),
          ilike(donors.displayName, `%${filter.value}%`),
          ilike(sql`CONCAT(${donors.firstName}, ' ', ${donors.lastName})`, `%${filter.value}%`)
        );
      default:
        return null;
    }

    return this.buildCondition(field, filter);
  }

  /**
   * Build filter conditions for project queries
   */
  private buildProjectFilterCondition(filter: QueryFilter): any {
    let field: any;

    switch (filter.field) {
      case "name":
        field = projects.name;
        break;
      case "description":
        field = projects.description;
        break;
      case "active":
        field = projects.active;
        break;
      case "goal":
        field = projects.goal;
        break;
      case "id":
        field = projects.id;
        break;
      case "createdAt":
        field = projects.createdAt;
        break;
      case "updatedAt":
        field = projects.updatedAt;
        break;
      default:
        return null;
    }

    return this.buildCondition(field, filter);
  }

  /**
   * Build filter conditions for staff queries
   */
  private buildStaffFilterCondition(filter: QueryFilter): any {
    let field: any;

    switch (filter.field) {
      case "firstName":
        field = staff.firstName;
        break;
      case "lastName":
        field = staff.lastName;
        break;
      case "email":
        field = staff.email;
        break;
      case "isRealPerson":
        field = staff.isRealPerson;
        break;
      case "isPrimary":
        field = staff.isPrimary;
        break;
      case "id":
        field = staff.id;
        break;
      case "createdAt":
        field = staff.createdAt;
        break;
      case "updatedAt":
        field = staff.updatedAt;
        break;
      case "name": // Special handling for combined name search
        return or(
          ilike(staff.firstName, `%${filter.value}%`),
          ilike(staff.lastName, `%${filter.value}%`),
          ilike(sql`CONCAT(${staff.firstName}, ' ', ${staff.lastName})`, `%${filter.value}%`)
        );
      default:
        return null;
    }

    return this.buildCondition(field, filter);
  }

  /**
   * Build condition based on operation and field
   */
  private buildCondition(field: any, filter: QueryFilter): any {
    switch (filter.operation) {
      case "equals":
        return eq(field, filter.value);
      case "not_equals":
        return sql`${field} != ${filter.value}`;
      case "contains":
        return ilike(field, `%${filter.value}%`);
      case "starts_with":
        return ilike(field, `${filter.value}%`);
      case "ends_with":
        return ilike(field, `%${filter.value}`);
      case "greater_than":
        return sql`${field} > ${filter.value}`;
      case "less_than":
        return sql`${field} < ${filter.value}`;
      case "greater_than_or_equal":
        return gte(field, filter.value);
      case "less_than_or_equal":
        return lte(field, filter.value);
      case "between":
        if (filter.values && filter.values.length === 2) {
          return between(field, filter.values[0], filter.values[1]);
        }
        break;
      case "in":
        if (filter.values && filter.values.length > 0) {
          return sql`${field} IN (${filter.values.map((v) => `'${v}'`).join(",")})`;
        }
        break;
      case "not_in":
        if (filter.values && filter.values.length > 0) {
          return sql`${field} NOT IN (${filter.values.map((v) => `'${v}'`).join(",")})`;
        }
        break;
      case "is_null":
        return sql`${field} IS NULL`;
      case "is_not_null":
        return sql`${field} IS NOT NULL`;
    }

    return null;
  }
}
