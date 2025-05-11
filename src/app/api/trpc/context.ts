import { BackendUser, useNullableUser } from "@/app/hooks/use-user";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

interface AuthContext {
  user: BackendUser | null;
}

interface RequestContext {
  auth: AuthContext;
  req: Request;
  resHeaders: Headers;
}

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions): Promise<RequestContext> {
  const user = await useNullableUser();
  return {
    auth: { user },
    req,
    resHeaders,
  };
}

export type Context = RequestContext;

export type ProtectedContext = Omit<Context, "auth"> & {
  auth: { user: BackendUser };
};
