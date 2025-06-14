import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  primaryKey,
  pgEnum,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Users table, adapted for Clerk user data.
 * Clerk User ID is stored in 'id'.
 * The original serial 'id' is removed to use Clerk's text ID as primary key.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk User ID
  firstName: text("first_name"), // From Clerk
  lastName: text("last_name"), // From Clerk
  email: varchar("email", { length: 255 }).notNull().unique(), // Kept from original, ensure it matches Clerk's primary email
  profileImageUrl: text("profile_image_url"), // From Clerk
  emailSignature: text("email_signature"), // User's email signature for generated emails
  // name: varchar("name", { length: 255 }).notNull(), // Original 'name' field, can be removed if using firstName/lastName
  memory: text("memory").array(), // Array of strings for user memory
  dismissedMemories: text("dismissed_memories").array(), // Array of strings for user dismissed memories
  stages: text("stages").array(), // Array of strings for user stages
  createdAt: timestamp("created_at")
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
  updatedAt: timestamp("updated_at")
    .default(sql`now()`)
    .notNull(), // Uses default(sql`now()`) for consistency
});

export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
  organizationMemberships: many(organizationMemberships),
  gmailOAuthToken: one(gmailOAuthTokens, {
    fields: [users.id],
    references: [gmailOAuthTokens.userId],
  }),
}));

/**
 * Example schema for a posts table with a relation to users
 * Note: authorId now needs to be text to reference the new users.id
 */
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  published: boolean("published").default(false).notNull(),
  authorId: text("author_id") // Changed from integer to text
    .references(() => users.id) // References the text ID of users table
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Organizations table based on Clerk organization data.
 */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(), // Clerk Organization ID
  name: text("name").notNull(),
  slug: text("slug"),
  imageUrl: text("image_url"),
  createdBy: text("created_by"), // Clerk User ID of the creator
  websiteUrl: text("website_url"),
  websiteSummary: text("website_summary"),
  description: text("description"),
  shortDescription: text("short_description"),
  writingInstructions: text("writing_instructions"),
  donorJourneyText: text("donor_journey_text"),
  donorJourney: jsonb("donor_journey").default(sql`'{"nodes": [], "edges": []}'::jsonb`), // JSON object for donor journey graph
  memory: text("memory")
    .array()
    .default(sql`'{}'::text[]`), // Array of strings for organization memory, default empty array
  createdAt: timestamp("created_at")
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`now()`)
    .notNull(),
});

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  organizationMemberships: many(organizationMemberships),
  createdByUser: one(users, {
    fields: [organizations.createdBy],
    references: [users.id],
    relationName: "organizationCreator", // Added relation name for clarity
  }),
  projects: many(projects),
  donors: many(donors),
  staff: many(staff),
}));

/**
 * Join table for users and organizations, representing memberships.
 */
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // e.g., 'admin', 'basic_member'
    createdAt: timestamp("created_at")
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`now()`)
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
  })
);

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMemberships.userId],
    references: [users.id],
  }),
}));

/**
 * Projects table to track different initiatives or campaigns
 */
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  goal: integer("goal"), // Amount in cents
  tags: text("tags").array(), // Array of tags
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Communication channel enum
 */
export const communicationChannelEnum = pgEnum("communication_channel", ["email", "phone", "text"]);

/**
 * Gender enum for donors
 */
export const genderEnum = pgEnum("gender", ["male", "female"]);

/**
 * Donors table to store donor information
 * Updated to support couple information from CSV imports
 */
export const donors = pgTable(
  "donors",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),

    // External ID from CRM systems - unique within organization
    externalId: varchar("external_id", { length: 255 }),

    // Legacy fields for backward compatibility (still required for now)
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),

    // New fields to support couple structure from CSV
    hisTitle: varchar("his_title", { length: 50 }), // Mr., Dr., Rabbi, etc.
    hisFirstName: varchar("his_first_name", { length: 255 }),
    hisInitial: varchar("his_initial", { length: 10 }),
    hisLastName: varchar("his_last_name", { length: 255 }), // His last name (may be different)

    herTitle: varchar("her_title", { length: 50 }), // Mrs., Ms., Dr., etc.
    herFirstName: varchar("her_first_name", { length: 255 }),
    herInitial: varchar("her_initial", { length: 10 }),
    herLastName: varchar("her_last_name", { length: 255 }), // Her last name (may be different)

    // Display name for communications (e.g., "Mr. and Mrs. Smith", "Dr. John and Mrs. Jane Doe")
    displayName: varchar("display_name", { length: 500 }),

    // Indicator if this is a couple record or individual
    isCouple: boolean("is_couple").default(false).notNull(),

    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    state: varchar("state", { length: 50 }),
    gender: genderEnum("gender"), // For individual donors
    notes: text("notes"),
    assignedToStaffId: integer("assigned_to_staff_id").references(() => staff.id),
    currentStageName: varchar("current_stage_name", { length: 255 }),
    classificationReasoning: text("classification_reasoning"),
    predictedActions: jsonb("predicted_actions"),
    // Research-derived fields from person research
    highPotentialDonor: boolean("high_potential_donor").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Email should be unique within each organization, not globally
    uniqueEmailPerOrg: unique("donors_email_organization_unique").on(table.email, table.organizationId),
    // External ID should be unique within each organization when provided
    uniqueExternalIdPerOrg: unique("donors_external_id_organization_unique").on(table.externalId, table.organizationId),
  })
);

/**
 * Donations table to track financial contributions
 */
export const donations = pgTable("donations", {
  id: serial("id").primaryKey(),
  donorId: integer("donor_id")
    .references(() => donors.id)
    .notNull(),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  date: timestamp("date").defaultNow().notNull(),
  amount: integer("amount").notNull(), // Stored in cents
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Staff table to track organization staff members
 */
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  isRealPerson: boolean("is_real_person").default(true).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(), // Only one staff member per organization can be primary
  signature: text("signature"), // Rich text signature for emails
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Communication threads table to group related communications
 */
export const communicationThreads = pgTable("communication_threads", {
  id: serial("id").primaryKey(),
  channel: communicationChannelEnum("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Join table for communication threads and staff
 */
export const communicationThreadStaff = pgTable(
  "communication_thread_staff",
  {
    threadId: integer("thread_id")
      .references(() => communicationThreads.id, { onDelete: "cascade" })
      .notNull(),
    staffId: integer("staff_id")
      .references(() => staff.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.threadId, t.staffId] }),
  })
);

/**
 * Join table for communication threads and donors
 */
export const communicationThreadDonors = pgTable(
  "communication_thread_donors",
  {
    threadId: integer("thread_id")
      .references(() => communicationThreads.id, { onDelete: "cascade" })
      .notNull(),
    donorId: integer("donor_id")
      .references(() => donors.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.threadId, t.donorId] }),
  })
);

/**
 * Communication content table to store individual messages
 */
export const communicationContent = pgTable("communication_content", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => communicationThreads.id)
    .notNull(),
  content: text("content").notNull(),
  datetime: timestamp("datetime").defaultNow().notNull(),
  fromStaffId: integer("from_staff_id").references(() => staff.id),
  fromDonorId: integer("from_donor_id").references(() => donors.id),
  toStaffId: integer("to_staff_id").references(() => staff.id),
  toDonorId: integer("to_donor_id").references(() => donors.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Add relations for the new tables
export const projectsRelations = relations(projects, ({ many, one }) => ({
  donations: many(donations),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
}));

export const donorsRelations = relations(donors, ({ many, one }) => ({
  donations: many(donations),
  communicationThreads: many(communicationThreadDonors),
  sentMessages: many(communicationContent, { relationName: "fromDonor" }),
  receivedMessages: many(communicationContent, { relationName: "toDonor" }),
  personResearch: many(personResearch),
  organization: one(organizations, {
    fields: [donors.organizationId],
    references: [organizations.id],
  }),
  assignedStaff: one(staff, {
    fields: [donors.assignedToStaffId],
    references: [staff.id],
    relationName: "assignedStaff",
  }),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  donor: one(donors, {
    fields: [donations.donorId],
    references: [donors.id],
  }),
  project: one(projects, {
    fields: [donations.projectId],
    references: [projects.id],
  }),
}));

export const staffRelations = relations(staff, ({ many, one }) => ({
  communicationThreads: many(communicationThreadStaff),
  sentMessages: many(communicationContent, { relationName: "fromStaff" }),
  receivedMessages: many(communicationContent, { relationName: "toStaff" }),
  organization: one(organizations, {
    fields: [staff.organizationId],
    references: [organizations.id],
  }),
  assignedDonors: many(donors, { relationName: "assignedStaff" }),
  gmailToken: one(staffGmailTokens, {
    fields: [staff.id],
    references: [staffGmailTokens.staffId],
  }),
  microsoftToken: one(staffMicrosoftTokens, {
    fields: [staff.id],
    references: [staffMicrosoftTokens.staffId],
  }),
}));

export const communicationThreadStaffRelations = relations(communicationThreadStaff, ({ one }) => ({
  thread: one(communicationThreads, {
    fields: [communicationThreadStaff.threadId],
    references: [communicationThreads.id],
  }),
  staff: one(staff, {
    fields: [communicationThreadStaff.staffId],
    references: [staff.id],
  }),
}));

export const communicationThreadDonorsRelations = relations(communicationThreadDonors, ({ one }) => ({
  thread: one(communicationThreads, {
    fields: [communicationThreadDonors.threadId],
    references: [communicationThreads.id],
  }),
  donor: one(donors, {
    fields: [communicationThreadDonors.donorId],
    references: [donors.id],
  }),
}));

export const communicationThreadsRelations = relations(communicationThreads, ({ many }) => ({
  staff: many(communicationThreadStaff),
  donors: many(communicationThreadDonors),
  content: many(communicationContent),
}));

export const communicationContentRelations = relations(communicationContent, ({ one }) => ({
  thread: one(communicationThreads, {
    fields: [communicationContent.threadId],
    references: [communicationThreads.id],
  }),
  fromStaff: one(staff, {
    fields: [communicationContent.fromStaffId],
    references: [staff.id],
    relationName: "fromStaff",
  }),
  fromDonor: one(donors, {
    fields: [communicationContent.fromDonorId],
    references: [donors.id],
    relationName: "fromDonor",
  }),
  toStaff: one(staff, {
    fields: [communicationContent.toStaffId],
    references: [staff.id],
    relationName: "toStaff",
  }),
  toDonor: one(donors, {
    fields: [communicationContent.toDonorId],
    references: [donors.id],
    relationName: "toDonor",
  }),
}));

export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // e.g. 'PREDICTED_ACTION', 'MANUAL', etc.
  status: text("status").notNull().default("PENDING"), // 'PENDING', 'IN_PROGRESS', 'COMPLETED', etc.
  priority: text("priority").notNull().default("MEDIUM"), // 'LOW', 'MEDIUM', 'HIGH'
  dueDate: timestamp("due_date"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),

  // Relations
  donorId: integer("donor_id").references(() => donors.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staff.id, { onDelete: "set null" }),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),

  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Additional fields for predicted actions
  explanation: text("explanation"), // Reasoning behind the predicted action
  instruction: text("instruction"), // Specific instructions for staff
});

// Add relations to existing tables if needed
export const todosRelations = relations(todos, ({ one }) => ({
  donor: one(donors, {
    fields: [todos.donorId],
    references: [donors.id],
  }),
  staff: one(staff, {
    fields: [todos.staffId],
    references: [staff.id],
  }),
  organization: one(organizations, {
    fields: [todos.organizationId],
    references: [organizations.id],
  }),
}));

// New table for Gmail OAuth Tokens
export const gmailOAuthTokens = pgTable("gmail_oauth_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // Assuming one Gmail account per user
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(), // Refresh tokens are often long
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"), // Can store a string of scopes, or use .array() if multiple distinct scopes are common
  tokenType: varchar("token_type", { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gmailOAuthTokensRelations = relations(gmailOAuthTokens, ({ one, many }) => ({
  user: one(users, {
    fields: [gmailOAuthTokens.userId],
    references: [users.id],
  }),
  linkedStaff: many(staff),
}));

/**
 * Templates table to store reusable communication prompts
 */
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(), // The actual template content/prompt
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Email generation sessions table to track bulk email generation
 */
export const emailGenerationSessions = pgTable("email_generation_sessions", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  templateId: integer("template_id").references(() => templates.id), // Optional reference to template used
  jobName: varchar("job_name", { length: 255 }).notNull(), // Name for the campaign
  instruction: text("instruction").notNull(),
  refinedInstruction: text("refined_instruction"),
  chatHistory: jsonb("chat_history").notNull(), // Array of chat messages
  selectedDonorIds: jsonb("selected_donor_ids").notNull(), // Array of donor IDs
  previewDonorIds: jsonb("preview_donor_ids").notNull(), // Array of donor IDs used for preview
  status: text("status").notNull().default("PENDING"), // 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'
  triggerJobId: text("trigger_job_id"), // ID of the trigger job
  totalDonors: integer("total_donors").notNull(),
  completedDonors: integer("completed_donors").default(0).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

/**
 * Generated emails table to store all generated emails
 */
export const generatedEmails = pgTable("generated_emails", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => emailGenerationSessions.id, { onDelete: "cascade" })
    .notNull(),
  donorId: integer("donor_id")
    .references(() => donors.id, { onDelete: "cascade" })
    .notNull(),
  subject: text("subject").notNull(),
  structuredContent: jsonb("structured_content").notNull(), // Array of EmailPiece objects
  referenceContexts: jsonb("reference_contexts").notNull(), // Record of reference IDs to context
  isPreview: boolean("is_preview").default(false).notNull(), // Whether this was a preview email
  isSent: boolean("is_sent").default(false).notNull(), // Whether this email has been sent
  sentAt: timestamp("sent_at"), // When this email was sent (null if not sent)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Relations for templates
 */
export const templatesRelations = relations(templates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [templates.organizationId],
    references: [organizations.id],
  }),
  emailGenerationSessions: many(emailGenerationSessions),
}));

/**
 * Relations for email generation tables
 */
export const emailGenerationSessionsRelations = relations(emailGenerationSessions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [emailGenerationSessions.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [emailGenerationSessions.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [emailGenerationSessions.templateId],
    references: [templates.id],
  }),
  generatedEmails: many(generatedEmails),
}));

export const generatedEmailsRelations = relations(generatedEmails, ({ one }) => ({
  session: one(emailGenerationSessions, {
    fields: [generatedEmails.sessionId],
    references: [emailGenerationSessions.id],
  }),
  donor: one(donors, {
    fields: [generatedEmails.donorId],
    references: [donors.id],
  }),
}));

/**
 * Email tracking tables for open and click tracking
 */

/**
 * Email trackers table to store tracking metadata for each sent email
 */
export const emailTrackers = pgTable("email_trackers", {
  id: text("id").primaryKey(), // UUID for tracking
  emailId: integer("email_id")
    .references(() => generatedEmails.id, { onDelete: "cascade" })
    .notNull(),
  donorId: integer("donor_id")
    .references(() => donors.id, { onDelete: "cascade" })
    .notNull(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  sessionId: integer("session_id")
    .references(() => emailGenerationSessions.id, { onDelete: "cascade" })
    .notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Link trackers table to store tracking metadata for each link in emails
 */
export const linkTrackers = pgTable("link_trackers", {
  id: text("id").primaryKey(), // UUID for tracking
  emailTrackerId: text("email_tracker_id")
    .references(() => emailTrackers.id, { onDelete: "cascade" })
    .notNull(),
  originalUrl: text("original_url").notNull(),
  linkText: text("link_text"), // The text of the link for context
  position: integer("position").notNull(), // Position of link in email content
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Email opens table to track when emails are opened
 */
export const emailOpens = pgTable("email_opens", {
  id: serial("id").primaryKey(),
  emailTrackerId: text("email_tracker_id")
    .references(() => emailTrackers.id, { onDelete: "cascade" })
    .notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 support
  userAgent: text("user_agent"),
  referer: text("referer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Link clicks table to track when links are clicked
 */
export const linkClicks = pgTable("link_clicks", {
  id: serial("id").primaryKey(),
  linkTrackerId: text("link_tracker_id")
    .references(() => linkTrackers.id, { onDelete: "cascade" })
    .notNull(),
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 support
  userAgent: text("user_agent"),
  referer: text("referer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Relations for email tracking tables
 */
export const emailTrackersRelations = relations(emailTrackers, ({ one, many }) => ({
  email: one(generatedEmails, {
    fields: [emailTrackers.emailId],
    references: [generatedEmails.id],
  }),
  donor: one(donors, {
    fields: [emailTrackers.donorId],
    references: [donors.id],
  }),
  organization: one(organizations, {
    fields: [emailTrackers.organizationId],
    references: [organizations.id],
  }),
  session: one(emailGenerationSessions, {
    fields: [emailTrackers.sessionId],
    references: [emailGenerationSessions.id],
  }),
  linkTrackers: many(linkTrackers),
  emailOpens: many(emailOpens),
}));

export const linkTrackersRelations = relations(linkTrackers, ({ one, many }) => ({
  emailTracker: one(emailTrackers, {
    fields: [linkTrackers.emailTrackerId],
    references: [emailTrackers.id],
  }),
  linkClicks: many(linkClicks),
}));

export const emailOpensRelations = relations(emailOpens, ({ one }) => ({
  emailTracker: one(emailTrackers, {
    fields: [emailOpens.emailTrackerId],
    references: [emailTrackers.id],
  }),
}));

export const linkClicksRelations = relations(linkClicks, ({ one }) => ({
  linkTracker: one(linkTrackers, {
    fields: [linkClicks.linkTrackerId],
    references: [linkTrackers.id],
  }),
}));

/**
 * Donor lists table to store named collections of donors
 */
export const donorLists = pgTable(
  "donor_lists",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Name should be unique within each organization
    uniqueNamePerOrg: unique("donor_lists_name_organization_unique").on(table.name, table.organizationId),
  })
);

/**
 * Donor list members table to store the many-to-many relationship between lists and donors
 */
export const donorListMembers = pgTable(
  "donor_list_members",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .references(() => donorLists.id, { onDelete: "cascade" })
      .notNull(),
    donorId: integer("donor_id")
      .references(() => donors.id, { onDelete: "cascade" })
      .notNull(),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    // Each donor can only be in a list once
    uniqueDonorPerList: unique("donor_list_members_donor_list_unique").on(table.listId, table.donorId),
  })
);

/**
 * Relations for donor lists tables
 */
export const donorListsRelations = relations(donorLists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [donorLists.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [donorLists.createdBy],
    references: [users.id],
  }),
  members: many(donorListMembers),
}));

export const donorListMembersRelations = relations(donorListMembers, ({ one }) => ({
  list: one(donorLists, {
    fields: [donorListMembers.listId],
    references: [donorLists.id],
  }),
  donor: one(donors, {
    fields: [donorListMembers.donorId],
    references: [donors.id],
  }),
  addedByUser: one(users, {
    fields: [donorListMembers.addedBy],
    references: [users.id],
  }),
}));

// New table for Staff Gmail OAuth Tokens - separate from user tokens
export const staffGmailTokens = pgTable("staff_gmail_tokens", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id")
    .references(() => staff.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One Gmail account per staff member
  email: varchar("email", { length: 255 }).notNull(), // The Gmail email address
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"), // OAuth scopes granted
  tokenType: varchar("token_type", { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const staffGmailTokensRelations = relations(staffGmailTokens, ({ one }) => ({
  staff: one(staff, {
    fields: [staffGmailTokens.staffId],
    references: [staff.id],
  }),
}));

// New table for Microsoft OAuth Tokens
export const microsoftOAuthTokens = pgTable("microsoft_oauth_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // Assuming one Microsoft account per user
  email: varchar("email", { length: 255 }).notNull(), // The Microsoft email address
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"), // Can store a string of scopes
  tokenType: varchar("token_type", { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const microsoftOAuthTokensRelations = relations(microsoftOAuthTokens, ({ one, many }) => ({
  user: one(users, {
    fields: [microsoftOAuthTokens.userId],
    references: [users.id],
  }),
  linkedStaff: many(staff),
}));

// New table for Staff Microsoft OAuth Tokens - separate from user tokens
export const staffMicrosoftTokens = pgTable("staff_microsoft_tokens", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id")
    .references(() => staff.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One Microsoft account per staff member
  email: varchar("email", { length: 255 }).notNull(), // The Microsoft email address
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"), // OAuth scopes granted
  tokenType: varchar("token_type", { length: 50 }), // e.g., "Bearer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const staffMicrosoftTokensRelations = relations(staffMicrosoftTokens, ({ one }) => ({
  staff: one(staff, {
    fields: [staffMicrosoftTokens.staffId],
    references: [staff.id],
  }),
}));

/**
 * Person research table to store research sessions and results
 * Each person (donor) can have multiple research sessions, with one marked as "live"
 * All research data is stored as JSON for simplicity
 */
export const personResearch = pgTable("person_research", {
  id: serial("id").primaryKey(),
  donorId: integer("donor_id")
    .references(() => donors.id, { onDelete: "cascade" })
    .notNull(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

  // Core research data
  researchTopic: text("research_topic").notNull(),

  // Store the entire PersonResearchResult as JSON
  researchData: jsonb("research_data").notNull(), // Contains: answer, citations, summaries, totalLoops, totalSources, timestamp

  // Status and versioning
  isLive: boolean("is_live").default(false).notNull(), // Only one research per donor can be live
  version: integer("version").default(1).notNull(), // Version number for this donor

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Relations for person research table
 */
export const personResearchRelations = relations(personResearch, ({ one }) => ({
  donor: one(donors, {
    fields: [personResearch.donorId],
    references: [donors.id],
  }),
  organization: one(organizations, {
    fields: [personResearch.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [personResearch.userId],
    references: [users.id],
  }),
}));

/**
 * Message role enum for WhatsApp chat
 */
export const whatsappMessageRoleEnum = pgEnum("whatsapp_message_role", ["user", "assistant"]);

/**
 * WhatsApp chat history table - stores conversations between staff and AI bot
 */
export const whatsappChatHistory = pgTable("whatsapp_chat_history_new", {
  id: serial("id").primaryKey(),
  organizationId: text("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  fromPhoneNumber: varchar("from_phone_number", { length: 20 }).notNull(), // Staff WhatsApp number
  messageId: varchar("message_id", { length: 255 }), // WhatsApp message ID if available
  role: whatsappMessageRoleEnum("role").notNull(), // "user" for staff message, "assistant" for AI response
  content: text("content").notNull(), // The message content
  toolCalls: jsonb("tool_calls"), // Store AI tool calls (search queries, etc.) for context
  toolResults: jsonb("tool_results"), // Store tool results for reference
  tokensUsed: jsonb("tokens_used"), // Store token usage info
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Relations for WhatsApp chat history
 */
export const whatsappChatHistoryRelations = relations(whatsappChatHistory, ({ one }) => ({
  organization: one(organizations, {
    fields: [whatsappChatHistory.organizationId],
    references: [organizations.id],
  }),
}));
