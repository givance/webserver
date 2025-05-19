import { db } from "../db";
import { organizations, organizationMemberships } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { User } from "./users";

// Types for organizations
export type Organization = InferSelectModel<typeof organizations>;
export type NewOrganization = InferInsertModel<typeof organizations>;

// Types for organization memberships
export type OrganizationMembership = InferSelectModel<typeof organizationMemberships>;
export type NewOrganizationMembership = InferInsertModel<typeof organizationMemberships>;

// Define a more specific type for the joined result
export type OrganizationMemberDetails = OrganizationMembership & { user: User | null };
export type UserOrganizationDetails = OrganizationMembership & { organization: Organization | null };

// Types for donor journey
export type DonorJourneyNode = {
  id: string;
  label: string;
  properties: Record<string, any>;
};

export type DonorJourneyEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, any>;
};

export type DonorJourney = {
  nodes: DonorJourneyNode[];
  edges: DonorJourneyEdge[];
};

/**
 * Retrieves an organization by its ID.
 * Can optionally include members.
 * @param id - The ID of the organization to retrieve.
 * @param options - Options to include related data e.g. members.
 * @returns The organization object if found, otherwise undefined.
 */
export async function getOrganizationById(
  id: string,
  options?: { includeMembers?: boolean }
): Promise<(Organization & { members?: OrganizationMemberDetails[] }) | undefined> {
  try {
    if (options?.includeMembers) {
      const result = await db.query.organizations.findFirst({
        where: eq(organizations.id, id),
        with: {
          organizationMemberships: {
            with: {
              user: true,
            },
          },
        },
      });
      if (!result) return undefined;
      // Transform to desired structure if needed, or adjust types
      const members = result.organizationMemberships.map((mem) => ({
        ...mem,
        user: mem.user as User | null, // Added type assertion for clarity
      }));
      return { ...result, members };
    }
    const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return result[0];
  } catch (error) {
    console.error("Failed to retrieve organization by ID:", error);
    throw new Error("Could not retrieve organization.");
  }
}

/**
 * Creates a new organization.
 * Often synced via Clerk webhooks, but can be used manually.
 * @param orgData - The data for the new organization.
 * @returns The newly created organization object.
 */
export async function createOrganization(orgData: NewOrganization): Promise<Organization> {
  try {
    const result = await db.insert(organizations).values(orgData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to create organization:", error);
    throw new Error("Could not create organization.");
  }
}

/**
 * Updates an existing organization.
 * @param id - The ID of the organization to update.
 * @param orgData - The data to update. 'id' should not be updated.
 * @returns The updated organization object.
 */
export async function updateOrganization(
  id: string,
  orgData: Partial<Omit<NewOrganization, "id">>
): Promise<Organization | undefined> {
  try {
    const result = await db
      .update(organizations)
      .set({ ...orgData, updatedAt: sql`now()` })
      .where(eq(organizations.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update organization:", error);
    throw new Error("Could not update organization.");
  }
}

/**
 * Lists all organizations.
 * @param limit - Maximum number of organizations to return.
 * @param offset - Number of organizations to skip.
 * @returns An array of organization objects.
 */
export async function listOrganizations(limit: number = 10, offset: number = 0): Promise<Organization[]> {
  try {
    return await db.select().from(organizations).limit(limit).offset(offset);
  } catch (error) {
    console.error("Failed to list organizations:", error);
    throw new Error("Could not list organizations.");
  }
}

// --- Organization Membership Functions ---

/**
 * Adds a user to an organization with a specific role.
 * @param membershipData - Data for the new membership (organizationId, userId, role).
 * @returns The newly created membership object.
 */
export async function addUserToOrganization(
  membershipData: NewOrganizationMembership
): Promise<OrganizationMembership> {
  try {
    const result = await db.insert(organizationMemberships).values(membershipData).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to add user to organization:", error);
    throw new Error("Could not add user to organization.");
  }
}

/**
 * Retrieves members of an organization.
 * This function fetches organization memberships and includes the related user data.
 * @param organizationId - The ID of the organization.
 * @returns An array of membership objects with user details.
 */
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMemberDetails[]> {
  try {
    const memberships = await db.query.organizationMemberships.findMany({
      where: eq(organizationMemberships.organizationId, organizationId),
      with: {
        user: true, // This relies on the 'user' relation in organizationMembershipsRelations
      },
    });
    // Explicitly cast to ensure the type checker is satisfied if necessary, though Drizzle should infer this well.
    return memberships as OrganizationMemberDetails[];
  } catch (error) {
    console.error("Failed to retrieve organization members:", error);
    throw new Error("Could not retrieve organization members.");
  }
}

/**
 * Updates a user's role in an organization.
 * @param organizationId - The ID of the organization.
 * @param userId - The ID of the user.
 * @param role - The new role for the user.
 * @returns The updated membership object.
 */
export async function updateUserRoleInOrganization(
  organizationId: string,
  userId: string,
  role: string
): Promise<OrganizationMembership | undefined> {
  try {
    const result = await db
      .update(organizationMemberships)
      .set({ role, updatedAt: sql`now()` })
      .where(
        and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId))
      )
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update user role:", error);
    throw new Error("Could not update user role in organization.");
  }
}

/**
 * Removes a user from an organization.
 * @param organizationId - The ID of the organization.
 * @param userId - The ID of the user to remove.
 */
export async function removeUserFromOrganization(organizationId: string, userId: string): Promise<void> {
  try {
    await db
      .delete(organizationMemberships)
      .where(
        and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId))
      );
  } catch (error) {
    console.error("Failed to remove user from organization:", error);
    throw new Error("Could not remove user from organization.");
  }
}

/**
 * Retrieves all organizations a user belongs to.
 * This function fetches organization memberships and includes the related organization data.
 * @param userId - The ID of the user.
 * @returns An array of membership objects with organization details.
 */
export async function getUserOrganizations(userId: string): Promise<UserOrganizationDetails[]> {
  try {
    const memberships = await db.query.organizationMemberships.findMany({
      where: eq(organizationMemberships.userId, userId),
      with: {
        organization: true, // This relies on the 'organization' relation in organizationMembershipsRelations
      },
    });
    return memberships as UserOrganizationDetails[];
  } catch (error) {
    console.error("Failed to retrieve user organizations:", error);
    throw new Error("Could not retrieve user organizations.");
  }
}

export async function getOrganizationMemories(id: string): Promise<string[]> {
  const result = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return result[0].memory || [];
}

/**
 * Updates the donor journey for an organization
 * @param id - The ID of the organization
 * @param donorJourney - The new donor journey data
 * @returns The updated organization
 */
export async function updateDonorJourney(id: string, donorJourney: DonorJourney): Promise<Organization | undefined> {
  try {
    const result = await db
      .update(organizations)
      .set({ donorJourney, updatedAt: sql`now()` })
      .where(eq(organizations.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error("Failed to update donor journey:", error);
    throw new Error("Could not update donor journey.");
  }
}

/**
 * Gets the donor journey for an organization
 * @param id - The ID of the organization
 * @returns The donor journey data
 */
export async function getDonorJourney(id: string): Promise<DonorJourney | undefined> {
  try {
    const result = await db
      .select({ donorJourney: organizations.donorJourney })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return result[0]?.donorJourney as DonorJourney | undefined;
  } catch (error) {
    console.error("Failed to get donor journey:", error);
    throw new Error("Could not get donor journey.");
  }
}
