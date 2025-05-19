#!/usr/bin/env tsx

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { config } from "dotenv";
import { eq, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import {
  communicationContent,
  communicationThreadDonors,
  communicationThreadStaff,
  communicationThreads,
  donations,
  donors,
  projects,
  staff,
} from "../app/lib/db/schema";

// Load environment variables
config();

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

interface StaffMember {
  id?: number;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
}

interface Donor {
  id?: number;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  state?: string;
  notes?: string;
  assignedToStaffId?: number;
}

interface Project {
  id?: number;
  organizationId: string;
  name: string;
  description: string;
  active: boolean;
  goal?: number;
  tags?: string[];
}

interface Communication {
  id?: number;
  channel: "email" | "phone" | "text";
  content: string;
  staffId: number;
  donorId: number;
  timestamp: Date;
}

interface Donation {
  id?: number;
  donorId: number;
  projectId: number;
  date: Date;
  amount: number;
  currency: string;
}

async function generateSampleStaff(count: number, organizationId: string): Promise<StaffMember[]> {
  const { object } = await generateObject({
    model: openai("gpt-4.1-mini"),
    schema: z.object({
      staff: z.array(
        z.object({
          firstName: z.string(),
          lastName: z.string(),
        })
      ),
    }),
    prompt: `Generate ${count} staff members with unique first and last name combinations.
    Make it diverse and realistic.`,
  });

  return object.staff.map((s, index) => ({
    organizationId,
    firstName: s.firstName,
    lastName: s.lastName,
    email: `${s.firstName.toLowerCase()}.${s.lastName.toLowerCase()}.${index}@organization.org`,
    isRealPerson: true,
  }));
}

async function generateSampleDonors(count: number, organizationId: string): Promise<Donor[]> {
  const { object } = await generateObject({
    model: openai("gpt-4.1-mini"),
    schema: z.object({
      donors: z.array(
        z.object({
          firstName: z.string(),
          lastName: z.string(),
          phone: z.string().optional(),
          address: z.string().optional(),
          state: z.string().optional(),
          notes: z.string().optional(),
        })
      ),
    }),
    prompt: `Generate ${count} realistic donors for a nonprofit organization.
    Make it diverse and realistic. Use unique first and last name combinations.`,
  });

  return object.donors.map((d, index) => ({
    organizationId,
    firstName: d.firstName,
    lastName: d.lastName,
    email: `${d.firstName.toLowerCase()}.${d.lastName.toLowerCase()}.${index}@example.com`,
    phone: d.phone,
    address: d.address,
    state: d.state,
    notes: d.notes,
  }));
}

async function generateSampleProjects(count: number, organizationId: string): Promise<Project[]> {
  const { object } = await generateObject({
    model: openai("gpt-4.1-mini"),
    schema: z.object({
      projects: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          active: z.boolean(),
          goal: z.number().optional(),
          tags: z.array(z.string()).optional(),
        })
      ),
    }),
    prompt: `Generate ${count} realistic nonprofit projects.
    Make it diverse and realistic.`,
  });

  return object.projects.map((p) => ({
    organizationId,
    name: p.name,
    description: p.description,
    active: p.active,
    goal: p.goal,
    tags: p.tags,
  }));
}

async function generateSampleCommunications(
  staffMembers: StaffMember[],
  donors: Donor[],
  count: number
): Promise<Communication[]> {
  const { object } = await generateObject({
    model: openai("gpt-4.1-mini"),
    schema: z.object({
      communications: z.array(
        z.object({
          subject: z.string(),
          content: z.string(),
          channel: z.enum(["email", "phone", "text"]),
          timestamp: z.string().datetime(),
        })
      ),
    }),
    prompt: `Generate ${count} realistic email communications between nonprofit donor relations managers and donors.
    Each communication should include:
    1. A subject line that reflects the purpose of the email
    2. A detailed email body that sounds like a real conversation
    3. Include specific details about:
       - Project updates and impact
       - Donation acknowledgments
       - Event invitations
       - Impact reports
       - Thank you messages
       - Follow-ups on previous conversations
    Make the tone professional but warm and personal. Include specific details about projects, amounts, and impact.
    The timestamp must be a valid ISO date string from the last 6 months.
    Format the content as a proper email with greeting and signature.
    Make the communications diverse and realistic.`,
  });

  return object.communications.map((c) => ({
    channel: c.channel,
    content: `Subject: ${c.subject}\n\n${c.content}`,
    staffId: staffMembers[Math.floor(Math.random() * staffMembers.length)].id!,
    donorId: donors[Math.floor(Math.random() * donors.length)].id!,
    timestamp: new Date(c.timestamp),
  }));
}

async function generateSampleDonations(donors: Donor[], projects: Project[], count: number): Promise<Donation[]> {
  const { object } = await generateObject({
    model: openai("gpt-4.1-mini"),
    schema: z.object({
      donations: z.array(
        z.object({
          amount: z.number().min(1000).max(10000000),
          date: z.string().datetime(),
        })
      ),
    }),
    prompt: `Generate ${count} donations.
    The amount should be between 1000 and 10000000 cents.
    The date must be a valid ISO date string from the last year.
    Make the donations diverse and realistic.`,
  });

  return object.donations.map((d) => {
    let date = new Date(d.date);
    if (isNaN(date.getTime())) {
      date = new Date();
    }
    return {
      donorId: donors[Math.floor(Math.random() * donors.length)].id!,
      projectId: projects[Math.floor(Math.random() * projects.length)].id!,
      date,
      amount: d.amount,
      currency: "USD",
    };
  });
}

async function main() {
  try {
    console.log("Starting sample data generation...");
    const organizationId = "org_2xIXH7pYMC1yiTPocKBNjsLUooz";

    // Delete existing data for the organization
    console.log("Cleaning up existing data...");

    // Get all IDs for the organization
    const orgProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.organizationId, organizationId));
    const orgStaff = await db.select({ id: staff.id }).from(staff).where(eq(staff.organizationId, organizationId));
    const orgDonors = await db.select({ id: donors.id }).from(donors).where(eq(donors.organizationId, organizationId));

    const projectIds = orgProjects.map((p) => p.id);
    const staffIds = orgStaff.map((s) => s.id);
    const donorIds = orgDonors.map((d) => d.id);

    // Delete in correct order to handle foreign key constraints
    if (projectIds.length > 0) {
      // Delete donations for organization's projects
      await db.delete(donations).where(inArray(donations.projectId, projectIds));
    }

    // Get all communication threads associated with the organization's staff and donors
    const threadIds = await db
      .select({ id: communicationThreads.id })
      .from(communicationThreads)
      .leftJoin(communicationThreadStaff, eq(communicationThreads.id, communicationThreadStaff.threadId))
      .leftJoin(communicationThreadDonors, eq(communicationThreads.id, communicationThreadDonors.threadId))
      .where(
        or(
          staffIds.length > 0 ? inArray(communicationThreadStaff.staffId, staffIds) : undefined,
          donorIds.length > 0 ? inArray(communicationThreadDonors.donorId, donorIds) : undefined
        )
      );

    // Delete communication data
    if (threadIds.length > 0) {
      const threadIdList = threadIds.map((t) => t.id);
      await db.delete(communicationContent).where(inArray(communicationContent.threadId, threadIdList));
      await db.delete(communicationThreadStaff).where(inArray(communicationThreadStaff.threadId, threadIdList));
      await db.delete(communicationThreadDonors).where(inArray(communicationThreadDonors.threadId, threadIdList));
      await db.delete(communicationThreads).where(inArray(communicationThreads.id, threadIdList));
    }

    // Finally delete the main organization data
    await db.delete(donors).where(eq(donors.organizationId, organizationId));
    await db.delete(staff).where(eq(staff.organizationId, organizationId));
    await db.delete(projects).where(eq(projects.organizationId, organizationId));

    // Generate initial data in parallel
    const [sampleStaff, sampleDonors, sampleProjects] = await Promise.all([
      generateSampleStaff(10, organizationId),
      generateSampleDonors(50, organizationId),
      generateSampleProjects(8, organizationId),
    ]);

    // Insert initial data
    const insertedStaff = await Promise.all(sampleStaff.map((s) => db.insert(staff).values(s).returning()));
    const staffWithIds = insertedStaff.map((s) => s[0]);
    console.log("Inserted staff data");

    const insertedDonors = await Promise.all(sampleDonors.map((d) => db.insert(donors).values(d).returning()));
    const donorsWithIds = insertedDonors.map((d) => d[0]);
    console.log("Inserted donor data");

    const insertedProjects = await Promise.all(sampleProjects.map((p) => db.insert(projects).values(p).returning()));
    const projectsWithIds = insertedProjects.map((p) => p[0]);
    console.log("Inserted project data");

    // Generate communications and donations in parallel
    const [sampleCommunications, sampleDonations] = await Promise.all([
      generateSampleCommunications(staffWithIds, donorsWithIds, 100),
      generateSampleDonations(donorsWithIds, projectsWithIds, 200),
    ]);

    // Insert communications
    for (const comm of sampleCommunications) {
      const [thread] = await db
        .insert(communicationThreads)
        .values({
          channel: comm.channel,
          createdAt: comm.timestamp,
          updatedAt: comm.timestamp,
        })
        .returning();

      await db.insert(communicationContent).values({
        threadId: thread.id,
        content: comm.content,
        createdAt: comm.timestamp,
        updatedAt: comm.timestamp,
      });

      await db.insert(communicationThreadStaff).values({
        threadId: thread.id,
        staffId: comm.staffId,
      });

      await db.insert(communicationThreadDonors).values({
        threadId: thread.id,
        donorId: comm.donorId,
      });
    }
    console.log("Inserted communication data");

    // Insert donations
    await Promise.all(sampleDonations.map((d) => db.insert(donations).values(d).onConflictDoNothing()));
    console.log("Inserted donation data");

    console.log("Sample data generation completed successfully!");
  } catch (error) {
    console.error("Error generating sample data:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
