import { Webhook } from "svix";
import { headers } from "next/headers";
import { type WebhookEvent } from "@clerk/nextjs/server";
import { env } from "@/app/lib/env";
import { db } from "@/app/lib/db/index"; // Adjusted path for Drizzle instance
import * as schema from "@/app/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers(); // Added await
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occurred -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local");
  }
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occurred", {
      status: 400,
    });
  }

  const eventType = evt.type;
  console.log(`Received webhook event: ${eventType}`);

  try {
    switch (eventType) {
      // User events
      case "user.created":
        await db.insert(schema.users).values({
          id: evt.data.id,
          email: evt.data.email_addresses.find((e) => e.id === evt.data.primary_email_address_id)?.email_address ?? "",
          firstName: evt.data.first_name,
          lastName: evt.data.last_name,
          profileImageUrl: evt.data.image_url,
          createdAt: evt.data.created_at ? new Date(evt.data.created_at) : new Date(),
          updatedAt: evt.data.updated_at ? new Date(evt.data.updated_at) : new Date(),
        });
        console.log(`User ${evt.data.id} created`);
        break;
      case "user.updated":
        await db
          .update(schema.users)
          .set({
            email:
              evt.data.email_addresses.find((e) => e.id === evt.data.primary_email_address_id)?.email_address ?? "",
            firstName: evt.data.first_name,
            lastName: evt.data.last_name,
            profileImageUrl: evt.data.image_url,
            updatedAt: evt.data.updated_at ? new Date(evt.data.updated_at) : new Date(),
          })
          .where(eq(schema.users.id, evt.data.id));
        console.log(`User ${evt.data.id} updated`);
        break;
      case "user.deleted":
        if (evt.data.id) {
          await db.delete(schema.users).where(eq(schema.users.id, evt.data.id));
          console.log(`User ${evt.data.id} deleted`);
        } else {
          console.error("User deleted event did not contain an ID or was malformed.", evt.data);
          return new Response("Error: User ID missing or malformed in delete event", { status: 400 });
        }
        break;

      // Organization events
      case "organization.created":
        await db.insert(schema.organizations).values({
          id: evt.data.id,
          name: evt.data.name,
          slug: evt.data.slug,
          imageUrl: evt.data.image_url,
          createdBy: evt.data.created_by,
          createdAt: evt.data.created_at ? new Date(evt.data.created_at) : new Date(),
          updatedAt: evt.data.updated_at ? new Date(evt.data.updated_at) : new Date(),
        });
        console.log(`Organization ${evt.data.id} created`);
        break;
      case "organization.updated":
        await db
          .update(schema.organizations)
          .set({
            name: evt.data.name,
            slug: evt.data.slug,
            imageUrl: evt.data.image_url,
            updatedAt: evt.data.updated_at ? new Date(evt.data.updated_at) : new Date(),
          })
          .where(eq(schema.organizations.id, evt.data.id));
        console.log(`Organization ${evt.data.id} updated`);
        break;
      case "organization.deleted":
        if (evt.data.id) {
          await db.delete(schema.organizations).where(eq(schema.organizations.id, evt.data.id));
          console.log(`Organization ${evt.data.id} deleted`);
        } else {
          console.error("Organization deleted event did not contain an ID or was malformed.", evt.data);
          return new Response("Error: Organization ID missing or malformed in delete event", { status: 400 });
        }
        break;

      // Organization Membership events
      case "organizationMembership.created":
        await db.insert(schema.organizationMemberships).values({
          organizationId: evt.data.organization.id,
          userId: evt.data.public_user_data.user_id,
          role: evt.data.role,
          createdAt: evt.data.created_at ? new Date(evt.data.created_at) : new Date(),
          updatedAt: evt.data.updated_at ? new Date(evt.data.updated_at) : new Date(),
        });
        console.log(
          `Membership created for user ${evt.data.public_user_data.user_id} in org ${evt.data.organization.id}`
        );
        break;
      case "organizationMembership.deleted":
        await db
          .delete(schema.organizationMemberships)
          .where(
            and(
              eq(schema.organizationMemberships.organizationId, evt.data.organization.id),
              eq(schema.organizationMemberships.userId, evt.data.public_user_data.user_id)
            )
          );
        console.log(
          `Membership deleted for user ${evt.data.public_user_data.user_id} in org ${evt.data.organization.id}`
        );
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error processing webhook event ${eventType}:`, error);
    // Check if error is an instance of Error to safely access message property
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Webhook Error: ${errorMessage}`, {
      status: 500,
    });
  }

  return new Response("Success", {
    status: 200,
  });
}
