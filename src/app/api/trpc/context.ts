import { BackendUser } from "@/app/hooks/use-user";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "@clerk/nextjs/server";
import { getUserById } from "@/app/lib/data/users";
import { getOrganizationById } from "@/app/lib/data/organizations";
import { logger } from "@/app/lib/logger";
import { createServices, type Services } from "@/app/lib/services";

// Create services instance once for the application
const services = createServices();

interface AuthContext {
  user: BackendUser | null;
}

interface RequestContext {
  auth: AuthContext;
  req: Request;
  resHeaders: Headers;
  services: Services;
}

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions): Promise<RequestContext> {
  const authData = await auth();
  const { userId, orgId, orgRole } = authData;

  if (!userId || !orgId) {
    return { auth: { user: null }, req, resHeaders, services };
  }

  const user = await getUserById(userId);
  const organization = await getOrganizationById(orgId);

  if (!user || !organization) {
    logger.error(
      `Could not find user or organization in backend (function: createContext, userId: ${userId}, orgId: ${orgId})`
    );
    return { auth: { user: null }, req, resHeaders, services };
  }

  const backendUser: BackendUser = {
    id: user.id,
    organizationId: organization.id,
    externalId: user.id,
    externalOrgId: organization.id,
    slug: organization.slug ?? "",
    role: orgRole ?? "UNDEFINED",
    email: user.email,
    isAdmin: () => orgRole === "org:admin",
  };

  return {
    auth: { user: backendUser },
    req,
    resHeaders,
    services,
  };
}

export type Context = RequestContext;

export type ProtectedContext = Omit<Context, "auth"> & {
  auth: { user: BackendUser };
};
