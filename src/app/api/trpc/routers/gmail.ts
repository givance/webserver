import { z } from "zod";
import { google } from "googleapis";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/app/lib/db";
import { gmailOAuthTokens } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/app/lib/env";

// Ensure you have these in your environment variables
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI; // e.g., https://app.givance.ai/api/trpc/gmail.handleOAuthCallback

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error("Missing Google OAuth credentials in environment variables. Gmail integration will not work.");
}

let oauth2Client: any;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI) {
  oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
} else {
  console.warn(
    "OAuth2Client for Google not initialized due to missing credentials. Gmail features requiring auth will fail."
  );
}

export const gmailRouter = router({
  getGmailAuthUrl: protectedProcedure.mutation(async ({ ctx }) => {
    if (!oauth2Client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email", // To get user's email for verification
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Important to get a refresh token
      scope: scopes,
      prompt: "consent", // Ensures the consent screen is shown, useful for re-authentication or changing scopes
      // Include state parameter for security if needed, store it and verify in callback
      // state: generateSomeSecureState(),
    });

    return { authUrl };
  }),

  handleOAuthCallback: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!oauth2Client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
      }
      // Optional: Verify the state parameter here if you used one
      // if (input.state !== getStoredState()) { throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid state parameter' }); }

      try {
        const { tokens } = await oauth2Client.getToken(input.code);
        oauth2Client.setCredentials(tokens);

        if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date || !tokens.scope) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve all necessary tokens from Google.",
          });
        }

        // Optional: Get user's email from Google to verify or link account
        // const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        // const profile = await gmail.users.getProfile({ userId: 'me' });
        // const emailAddress = profile.data.emailAddress;
        // if (emailAddress !== ctx.auth.user.email) { /* Handle mismatch if necessary */ }

        const userId = ctx.auth.user.id;

        // Upsert the token information
        await db
          .insert(gmailOAuthTokens)
          .values({
            userId: userId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(tokens.expiry_date),
            scope: tokens.scope,
            tokenType: tokens.token_type || "Bearer",
          })
          .onConflictDoUpdate({
            target: gmailOAuthTokens.userId,
            set: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token, // Important: Google might only send refresh_token on the first authorization
              expiresAt: new Date(tokens.expiry_date),
              scope: tokens.scope,
              tokenType: tokens.token_type || "Bearer",
              updatedAt: new Date(),
            },
          });

        return { success: true, message: "Gmail account connected successfully." };
      } catch (error: any) {
        console.error("Error handling Gmail OAuth callback:", error);
        // Check if the error is from Google API and format it
        if (error.response && error.response.data && error.response.data.error_description) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Google API Error: ${error.response.data.error_description}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to process Gmail OAuth callback.",
        });
      }
    }),
});
