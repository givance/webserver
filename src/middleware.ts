import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define public routes that do not require authentication.
// These routes are accessible to everyone.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)", // Matches /sign-in and any sub-paths
  "/sign-up(.*)", // Matches /sign-up and any sub-paths
  "/create-organization(.*)", // Page to create an organization, must be public
  "/api/webhook(.*)", // Webhook routes are typically public but secured by other means
  "/api/whatsapp/webhook(.*)", // WhatsApp webhook endpoint
  "/api/track/open/(.*)", // Email open tracking - must be public for tracking pixels
  "/api/track/click/(.*)", // Email click tracking - must be public for link redirects
  // Add other public pages like landing pages, about us, etc.
  // e.g., '/about', '/pricing'
]);

export default clerkMiddleware(async (auth, req) => {
  // First, check if the route is public.
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // For non-public routes, get the authentication state.
  // auth() returns a promise, so we await it.
  const authState = await auth();

  // If there is no active session, redirect to sign-in.
  // Methods like redirectToSignIn are on the awaited authState object.
  if (!authState.sessionId) {
    return authState.redirectToSignIn({ returnBackUrl: req.nextUrl.pathname });
  }

  // User is authenticated (sessionId exists).
  // Destructure properties from authState.
  const { userId, orgId } = authState;

  // Check for organization membership.
  if (userId && !orgId && req.nextUrl.pathname !== "/create-organization") {
    const createOrgUrl = new URL("/create-organization", req.url);
    return NextResponse.redirect(createOrgUrl);
  }

  // If we've reached here, the user is authenticated.
  // If they have an org, or if the route doesn't require an org beyond login,
  // allow access. Clerk protects all non-public routes by default.
  // Specific role/permission checks can be done using authState.protect() if needed for certain protected routes.
  // For example:
  // if (isProtectedRoute(req)) {
  //   authState.protect((has) => has({ role: "org:admin" }));
  // }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files.
    "/((?!_next|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes (they might be public or protected based on their own logic or the rules above).
    "/(api|trpc)(.*)",
  ],
  // It's often cleaner to declare public routes here as well,
  // clerkMiddleware will then not attempt to protect them by default.
  // Our isPublicRoute check above provides more fine-grained control if needed.
  // publicRoutes: ['/sign-in(.*)', '/sign-up(.*)', '/create-organization(.*)', '/api/webhook(.*)'],
};
