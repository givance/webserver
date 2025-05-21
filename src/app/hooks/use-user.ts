import { logger } from "@/app/lib/logger";
import { getUserById } from "@/app/lib/data/users";
import { getOrganizationById } from "@/app/lib/data/organizations";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

export interface BackendUser {
  id: string;
  organizationId: string;
  externalId: string;
  externalOrgId: string;
  slug: string;
  role: string;
  email?: string;
  isAdmin: () => boolean;
}

interface ClerkAuthData {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
}

export const useNullableUser = cache(async (): Promise<BackendUser | null> => {
  const authData = await auth();
  const { userId, orgId, orgRole } = authData as ClerkAuthData;

  if (!userId || !orgId) {
    return null;
  }

  const user = await getUserById(userId);
  const organization = await getOrganizationById(orgId);

  if (!user || !organization) {
    logger.error("could not find user or organization in backend", {
      function: "useNullableUser",
      userId,
      orgId,
    });
    return null;
  }

  return {
    id: user.id,
    organizationId: organization.id,
    externalId: user.id, // In our schema, we use Clerk's ID directly
    externalOrgId: organization.id, // In our schema, we use Clerk's org ID directly
    slug: organization.slug ?? "",
    role: orgRole ?? "UNDEFINED",
    isAdmin: () => orgRole === "org:admin",
  };
});

export const useUser = cache(async (): Promise<BackendUser> => {
  const authData = await auth();
  const { userId, orgId, orgRole } = authData as ClerkAuthData;

  if (!userId || !orgId) {
    logger.error(`No user or organization found in auth (function: useUser, userId: ${userId}, orgId: ${orgId})`);
    throw new Error("User or organization not found");
  }

  const user = await getUserById(userId);
  const organization = await getOrganizationById(orgId);

  if (!user || !organization) {
    logger.error(
      `Could not find user or organization in backend (function: useUser, userId: ${userId}, orgId: ${orgId})`
    );
    throw new Error("User or organization not found in backend");
  }

  logger.info(`Found user and organization in backend (userId: ${userId}, orgId: ${orgId})`);

  return {
    id: user.id,
    organizationId: organization.id,
    externalId: user.id, // In our schema, we use Clerk's ID directly
    externalOrgId: organization.id, // In our schema, we use Clerk's org ID directly
    slug: organization.slug ?? "",
    role: orgRole ?? "UNDEFINED",
    isAdmin: () => orgRole === "org:admin",
  };
});

export const useFakeUser = cache(async (): Promise<BackendUser> => {
  return {
    id: "cm2ikkntj0003c5foafh9ayt4",
    organizationId: "cm37vs3tt0001vwf5hwtrydqe",
    externalId: "user_2o80q0Y3cYJVT2NvMpRwChGWNVB",
    externalOrgId: "org_2o81AWhv4TMrv7TlokFQO0NeIVb",
    slug: "demoorg",
    role: "org:admin",
    isAdmin: () => true,
  };
});
