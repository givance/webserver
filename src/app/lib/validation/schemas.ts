import { z } from 'zod';

/**
 * Common validation schemas used across multiple routers
 */

// Base schemas for common types
export const idSchema = z.number().int().positive();
export const stringIdSchema = z.string().min(1);
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string();
export const urlSchema = z.string().url();
export const phoneSchema = z.string();
export const dateSchema = z.date();
export const dateStringSchema = z.string().datetime();

// Common field schemas
export const nameSchema = z.string().min(1).max(255);
export const descriptionSchema = z.string();
export const donorNoteSchema = z.object({
  createdAt: z.string(),
  createdBy: z.string(),
  content: z.string(),
});
export const notesSchema = z.array(donorNoteSchema);
export const addressSchema = z.string().max(500);
export const currencySchema = z.string().length(3).default('USD');
export const amountSchema = z.number().int().positive();
export const percentageSchema = z.number().min(0).max(100);

// Pagination schemas
export const paginationSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

export const cursorPaginationSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const orderingSchema = z.object({
  orderBy: z.string().optional(),
  orderDirection: z.enum(['asc', 'desc']).optional(),
});

// Search and filter schemas
export const searchSchema = z.object({
  searchTerm: z.string().optional(),
  searchFields: z.array(z.string()).optional(),
});

export const dateRangeSchema = z
  .object({
    startDate: z.date().optional(),
    endDate: z.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'Start date must be before or equal to end date',
      path: ['endDate'],
    }
  );

// Response wrapper schemas
export const successResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    limit: z.number().int().positive(),
    offset: z.number().int().min(0),
    hasMore: z.boolean(),
  });

// Batch operation schemas
export const batchOperationSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

export const batchResultSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    successful: z.array(itemSchema),
    failed: z.array(
      z.object({
        id: idSchema,
        error: z.string(),
      })
    ),
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
    email: z.string(),
    phone: phoneSchema.optional(),
    address: z.string().optional(),
    state: z.string().length(2).optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
    notes: notesSchema.optional(),
    assignedToStaffId: idSchema.optional(),
  }),

  update: z.object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    address: z.string().optional(),
    state: z.string().length(2).optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
    notes: notesSchema.optional(),
    assignedToStaffId: idSchema.nullable().optional(),
  }),

  list: z.object({
    searchTerm: z.string().optional(),
    state: z.string().length(2).optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
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
    signature: z.string().optional(),
  }),

  update: z.object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    role: z.string().min(1).max(100).optional(),
    department: z.string().max(100).optional(),
    signature: z.string().optional(),
  }),

  updateSignature: z.object({
    signature: z.string().optional(),
  }),

  linkEmailAccount: z.object({
    gmailTokenId: idSchema,
  }),

  unlinkEmailAccount: z.object({}),

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
    currency: z.string().length(3).default('USD'),
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
    channel: z.enum(['email', 'phone', 'text']),
    staffIds: z.array(idSchema).optional(),
    donorIds: z.array(idSchema).optional(),
  }),

  threadDetails: z.object({
    includeStaff: z.boolean().optional(),
    includeDonors: z.boolean().optional(),
    includeMessages: z.union([z.boolean(), z.object({ limit: z.number() })]).optional(),
  }),

  listThreads: z.object({
    channel: z.enum(['email', 'phone', 'text']).optional(),
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
    chatHistory: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    ),
    selectedDonorIds: z.array(idSchema),
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
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.date().optional(),
    scheduledDate: z.date().optional(),
    donorId: idSchema.optional(),
    staffId: idSchema.optional(),
    explanation: z.string().optional(),
  }),

  update: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    type: z.string().min(1).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    dueDate: z.date().nullable().optional(),
    scheduledDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    donorId: idSchema.nullable().optional(),
    staffId: idSchema.nullable().optional(),
    explanation: z.string().optional(),
  }),

  list: z.object({
    type: z.string().optional(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    donorId: idSchema.optional(),
    staffId: idSchema.optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
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
 * Donor list criteria filtering schemas
 */
const donorListCriteriaSchema = z
  .object({
    // Donor creation date range
    createdDateFrom: z.date().optional(),
    createdDateTo: z.date().optional(),

    // Last donation date range
    lastDonationDateFrom: z.date().optional(),
    lastDonationDateTo: z.date().optional(),

    // Highest donation amount range (in cents)
    highestDonationMin: z.number().min(0).optional(),
    highestDonationMax: z.number().min(0).optional(),

    // Total donation amount range (in cents)
    totalDonationMin: z.number().min(0).optional(),
    totalDonationMax: z.number().min(0).optional(),

    // Assigned staff member
    assignedToStaffId: idSchema.nullable().optional(),

    // Include donors with no donations
    includeNoDonations: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Validate date ranges
      if (data.createdDateFrom && data.createdDateTo) {
        return data.createdDateFrom <= data.createdDateTo;
      }
      return true;
    },
    {
      message: "Created date 'from' must be before or equal to 'to' date",
      path: ['createdDateTo'],
    }
  )
  .refine(
    (data) => {
      // Validate last donation date ranges
      if (data.lastDonationDateFrom && data.lastDonationDateTo) {
        return data.lastDonationDateFrom <= data.lastDonationDateTo;
      }
      return true;
    },
    {
      message: "Last donation date 'from' must be before or equal to 'to' date",
      path: ['lastDonationDateTo'],
    }
  )
  .refine(
    (data) => {
      // Validate highest donation amount ranges
      if (data.highestDonationMin !== undefined && data.highestDonationMax !== undefined) {
        return data.highestDonationMin <= data.highestDonationMax;
      }
      return true;
    },
    {
      message: 'Highest donation minimum must be less than or equal to maximum',
      path: ['highestDonationMax'],
    }
  )
  .refine(
    (data) => {
      // Validate total donation amount ranges
      if (data.totalDonationMin !== undefined && data.totalDonationMax !== undefined) {
        return data.totalDonationMin <= data.totalDonationMax;
      }
      return true;
    },
    {
      message: 'Total donation minimum must be less than or equal to maximum',
      path: ['totalDonationMax'],
    }
  );

export const donorListCriteriaSchemas = {
  criteria: donorListCriteriaSchema,

  createByCriteria: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    criteria: donorListCriteriaSchema,
  }),

  previewByCriteria: z.object({
    criteria: donorListCriteriaSchema,
    limit: z.number().min(1).max(100).optional(),
    offset: z.number().min(0).optional(),
  }),
} as const;

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
  donorListCriteria: donorListCriteriaSchemas,
};
