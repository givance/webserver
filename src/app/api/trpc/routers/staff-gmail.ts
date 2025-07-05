import { z } from "zod";
import { google } from "googleapis";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/app/lib/db";
import { staffGmailTokens, staff } from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";

// Ensure you have these in your environment variables
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI;
// Staff-specific redirect URI (same domain, different path)
const STAFF_GMAIL_REDIRECT_URI = env.GOOGLE_REDIRECT_URI.replace(
  "/settings/gmail/callback",
  "/settings/gmail/staff-callback"
);

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error("Missing Google OAuth credentials in environment variables. Staff Gmail integration will not work.");
}

let oauth2Client: any;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && STAFF_GMAIL_REDIRECT_URI) {
  oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, STAFF_GMAIL_REDIRECT_URI);
} else {
  console.warn(
    "OAuth2Client for Google not initialized due to missing credentials. Staff Gmail features requiring auth will fail."
  );
}

export const staffGmailRouter = router({
  /**
   * Get Gmail authentication URL for a specific staff member
   */
  getStaffGmailAuthUrl: protectedProcedure.input(z.object({ staffId: z.number() })).mutation(async ({ ctx, input }) => {
    if (!oauth2Client) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
    }

    // Verify staff member exists and belongs to user's organization
    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, input.staffId), eq(staff.organizationId, ctx.auth.user.organizationId)),
    });

    if (!staffMember) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    const scopes = [
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email", // To get user's email for verification
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Important to get a refresh token
      scope: scopes,
      prompt: "consent", // Ensures the consent screen is shown
      state: JSON.stringify({
        staffId: input.staffId,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      }), // Include staff context
    });

    return { authUrl };
  }),

  /**
   * Handle OAuth callback for staff Gmail authentication
   */
  handleStaffGmailOAuthCallback: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!oauth2Client) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth client not configured." });
      }

      let stateData;
      try {
        stateData = JSON.parse(input.state);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid state parameter",
        });
      }

      const { staffId, organizationId, userId } = stateData;

      // Verify user and staff member
      if (userId !== ctx.auth.user.id || organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Unauthorized to link Gmail for this staff member",
        });
      }

      const staffMember = await db.query.staff.findFirst({
        where: and(eq(staff.id, staffId), eq(staff.organizationId, organizationId)),
      });

      if (!staffMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found",
        });
      }

      try {
        const { tokens } = await oauth2Client.getToken(input.code);
        oauth2Client.setCredentials(tokens);

        if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date || !tokens.scope) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve all necessary tokens from Google.",
          });
        }

        // Get user's email from Google to store with the token
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: "me" });
        const emailAddress = profile.data.emailAddress;

        if (!emailAddress) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve email address from Google.",
          });
        }

        // Upsert the staff Gmail token
        await db
          .insert(staffGmailTokens)
          .values({
            staffId: staffId,
            email: emailAddress,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(tokens.expiry_date),
            scope: tokens.scope,
            tokenType: tokens.token_type || "Bearer",
          })
          .onConflictDoUpdate({
            target: staffGmailTokens.staffId,
            set: {
              email: emailAddress,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: new Date(tokens.expiry_date),
              scope: tokens.scope,
              tokenType: tokens.token_type || "Bearer",
              updatedAt: new Date(),
            },
          });

        logger.info(`Staff Gmail account connected for staff ${staffId}: ${emailAddress}`);

        return {
          success: true,
          message: `Gmail account ${emailAddress} connected successfully for ${staffMember.firstName} ${staffMember.lastName}.`,
          email: emailAddress,
        };
      } catch (error: any) {
        console.error("Error handling staff Gmail OAuth callback:", error);
        if (error.response && error.response.data && error.response.data.error_description) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Google API Error: ${error.response.data.error_description}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to process staff Gmail OAuth callback.",
        });
      }
    }),

  /**
   * Get Gmail connection status for a specific staff member
   */
  getStaffGmailConnectionStatus: protectedProcedure
    .input(z.object({ staffId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify staff member exists and belongs to user's organization
      const staffMember = await db.query.staff.findFirst({
        where: and(eq(staff.id, input.staffId), eq(staff.organizationId, ctx.auth.user.organizationId)),
        with: {
          gmailToken: true,
        },
      });

      if (!staffMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found",
        });
      }

      if (staffMember.gmailToken) {
        return {
          isConnected: true,
          email: staffMember.gmailToken.email,
          message: `Connected with ${staffMember.gmailToken.email}`,
        };
      }

      return {
        isConnected: false,
        email: null,
        message: "Gmail account not connected.",
      };
    }),

  /**
   * Disconnect Gmail account for a specific staff member
   */
  disconnectStaffGmail: protectedProcedure.input(z.object({ staffId: z.number() })).mutation(async ({ ctx, input }) => {
    // Verify staff member exists and belongs to user's organization
    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, input.staffId), eq(staff.organizationId, ctx.auth.user.organizationId)),
    });

    if (!staffMember) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found",
      });
    }

    // Delete the Gmail token for this staff member
    await ctx.services.staffGmail.disconnectStaffGmailToken(input.staffId);

    return {
      success: true,
      message: `Gmail account disconnected for ${staffMember.firstName} ${staffMember.lastName}.`,
    };
  }),
});
