import { z } from "zod";

/**
 * Common validation schemas used across multiple routers
 */

// Base schemas for common types
export const idSchema = z.number().int().positive();
export const stringIdSchema = z.string().min(1);
export const emailSchema = z.string().email();
export const urlSchema = z.string().url();
export const phoneSchema = z.string().regex(/^\+?[\d\s\-\(\)]+$/, "Invalid phone number format");

// Pagination schemas
export const paginationSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

export const orderingSchema = z.object({
  orderBy: z.string().optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

/**
 * Organization-related validation schemas
 */
const donorJourneyNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  properties: z
    .object({
      description: z.string(),
      actions: z.array(z.string()).optional(),
    })
    .catchall(z.any()),
});

const donorJourneyEdgeSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
  target: z.string(),
  properties: z.record(z.string(), z.any()).default({}),
});

export const organizationSchemas = {
  update: z.object({
    websiteUrl: z.string().url().nullable().optional(),
    websiteSummary: z.string().optional(),
    description: z.string().optional(),
    writingInstructions: z.string().optional(),
    memory: z.array(z.string()).optional(),
  }),

  moveMemory: z.object({
    memoryIndex: z.number().int().min(0),
  }),

  donorJourneyNode: donorJourneyNodeSchema,

  donorJourneyEdge: donorJourneyEdgeSchema,

  donorJourney: z.object({
    nodes: z.array(donorJourneyNodeSchema),
    edges: z.array(donorJourneyEdgeSchema),
  }),

  donorJourneyText: z.string().min(1),
};

/**
 * Donor-related validation schemas
 */
export const donorSchemas = {
  create: z.object({
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    email: emailSchema,
    phone: phoneSchema.optional(),
    address: z.string().optional(),
    state: z.string().length(2).optional(),
    notes: z.string().optional(),
    assignedToStaffId: idSchema.optional(),
  }),

  update: z.object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    address: z.string().optional(),
    state: z.string().length(2).optional(),
    notes: z.string().optional(),
    assignedToStaffId: idSchema.nullable().optional(),
  }),

  list: z.object({
    searchTerm: z.string().optional(),
    state: z.string().length(2).optional(),
    assignedToStaffId: idSchema.nullable().optional(),
    ...paginationSchema.shape,
    ...orderingSchema.shape,
  }),

  assign: z.object({
    donorId: idSchema,
    staffId: idSchema,
  }),
};

/**
 * Staff-related validation schemas
 */
export const staffSchemas = {
  create: z.object({
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    email: emailSchema,
    phone: phoneSchema.optional(),
    role: z.string().min(1).max(100),
    department: z.string().max(100).optional(),
  }),

  update: z.object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    role: z.string().min(1).max(100).optional(),
    department: z.string().max(100).optional(),
  }),

  list: z.object({
    searchTerm: z.string().optional(),
    role: z.string().optional(),
    department: z.string().optional(),
    ...paginationSchema.shape,
    ...orderingSchema.shape,
  }),
};

/**
 * Project-related validation schemas
 */
export const projectSchemas = {
  create: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    goal: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }),

  update: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    goal: z.number().int().positive().nullable().optional(),
    tags: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  }),

  list: z.object({
    searchTerm: z.string().optional(),
    active: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    ...paginationSchema.shape,
    ...orderingSchema.shape,
  }),
};

/**
 * Donation-related validation schemas
 */
export const donationSchemas = {
  create: z.object({
    donorId: idSchema,
    projectId: idSchema,
    amount: z.number().int().positive(),
    currency: z.string().length(3).default("USD"),
    date: z.date().optional(),
  }),

  update: z.object({
    donorId: idSchema.optional(),
    projectId: idSchema.optional(),
    amount: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    date: z.date().optional(),
  }),

  list: z.object({
    donorId: idSchema.optional(),
    projectId: idSchema.optional(),
    minAmount: z.number().int().positive().optional(),
    maxAmount: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    includeDonor: z.boolean().optional(),
    includeProject: z.boolean().optional(),
    ...paginationSchema.shape,
    ...orderingSchema.shape,
  }),
};

/**
 * Communication-related validation schemas
 */
export const communicationSchemas = {
  threadId: z.object({
    id: idSchema,
  }),

  createThread: z.object({
    channel: z.enum(["email", "phone", "text"]),
    staffIds: z.array(idSchema).optional(),
    donorIds: z.array(idSchema).optional(),
  }),

  threadDetails: z.object({
    includeStaff: z.boolean().optional(),
    includeDonors: z.boolean().optional(),
    includeMessages: z.union([z.boolean(), z.object({ limit: z.number() })]).optional(),
  }),

  listThreads: z.object({
    channel: z.enum(["email", "phone", "text"]).optional(),
    staffId: idSchema.optional(),
    donorId: idSchema.optional(),
    includeStaff: z.boolean().optional(),
    includeDonors: z.boolean().optional(),
    includeLatestMessage: z.boolean().optional(),
    ...paginationSchema.shape,
  }),

  addMessage: z.object({
    threadId: idSchema,
    content: z.string().min(1),
    fromStaffId: idSchema.optional(),
    fromDonorId: idSchema.optional(),
    toStaffId: idSchema.optional(),
    toDonorId: idSchema.optional(),
  }),

  getMessages: z.object({
    threadId: idSchema,
    includeSendersRecipients: z.boolean().optional(),
    ...paginationSchema.shape,
  }),

  participant: z.object({
    threadId: idSchema,
    participantId: idSchema,
  }),

  generateEmails: z.object({
    instruction: z.string().min(1),
    donors: z.array(
      z.object({
        id: idSchema,
        firstName: z.string(),
        lastName: z.string(),
        email: emailSchema,
      })
    ),
    organizationName: z.string().min(1),
    organizationWritingInstructions: z.string().optional(),
    previousInstruction: z.string().optional(),
  }),

  createSession: z.object({
    jobName: z.string().min(1).max(255),
    instruction: z.string().min(1),
    chatHistory: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    ),
    selectedDonorIds: z.array(idSchema),
    previewDonorIds: z.array(idSchema),
    refinedInstruction: z.string().optional(),
  }),

  getSession: z.object({
    sessionId: idSchema,
  }),

  getSessionStatus: z.object({
    sessionId: idSchema,
  }),

  deleteJob: z.object({
    jobId: idSchema,
  }),
};

/**
 * User-related validation schemas
 */
export const userSchemas = {
  update: z.object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: emailSchema.optional(),
    profileImageUrl: urlSchema.optional(),
    memory: z.array(z.string()).optional(),
    dismissedMemories: z.array(z.string()).optional(),
    stages: z.array(z.string()).optional(),
  }),

  updateMemory: z.object({
    memory: z.array(z.string()),
  }),

  dismissMemory: z.object({
    memoryIndex: z.number().int().min(0),
  }),
};

/**
 * Analysis-related validation schemas
 */
export const analysisSchemas = {
  analyzeDonors: z.object({
    donorIds: z.array(stringIdSchema).min(1),
  }),
};

/**
 * Todo-related validation schemas
 */
export const todoSchemas = {
  create: z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    type: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueDate: z.date().optional(),
    scheduledDate: z.date().optional(),
    donorId: idSchema.optional(),
    staffId: idSchema.optional(),
    explanation: z.string().optional(),
    instruction: z.string().optional(),
  }),

  update: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    type: z.string().min(1).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    dueDate: z.date().nullable().optional(),
    scheduledDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    donorId: idSchema.nullable().optional(),
    staffId: idSchema.nullable().optional(),
    explanation: z.string().optional(),
    instruction: z.string().optional(),
  }),

  list: z.object({
    type: z.string().optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    donorId: idSchema.optional(),
    staffId: idSchema.optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    ...paginationSchema.shape,
    ...orderingSchema.shape,
  }),
};

/**
 * Gmail-related validation schemas
 */
export const gmailSchemas = {
  authCallback: z.object({
    code: z.string(),
    state: z.string().optional(),
  }),

  sendEmail: z.object({
    to: emailSchema,
    subject: z.string().min(1),
    body: z.string().min(1),
    isHtml: z.boolean().optional(),
  }),
};

/**
 * Combined schemas export for easy access
 */
export const schemas = {
  common: {
    id: idSchema,
    stringId: stringIdSchema,
    email: emailSchema,
    url: urlSchema,
    phone: phoneSchema,
    pagination: paginationSchema,
    ordering: orderingSchema,
  },
  organizations: organizationSchemas,
  donors: donorSchemas,
  staff: staffSchemas,
  projects: projectSchemas,
  donations: donationSchemas,
  communications: communicationSchemas,
  users: userSchemas,
  analysis: analysisSchemas,
  todos: todoSchemas,
  gmail: gmailSchemas,
};
