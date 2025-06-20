# Developer Gotchas and Pitfalls Guide

This document identifies common mistakes, gotchas, and potential pitfalls developers should be aware of when working with this Next.js 15 nonprofit donor management platform.

## 🔐 Multi-Tenant Security Gotchas

### Critical Organization ID Verification
**⚠️ The most critical security pattern in this codebase**

**ALWAYS verify organization access:**
```typescript
// ✅ CORRECT - Every database query MUST include organizationId
const donor = await getDonorById(id, ctx.auth.user.organizationId);

// ❌ WRONG - Direct database access without organization scoping
const donor = await db.select().from(donors).where(eq(donors.id, id));
```

### Common Multi-Tenant Security Mistakes

1. **Forgetting Organization Scoping in Database Queries**
   ```typescript
   // ❌ SECURITY VULNERABILITY - Missing organization check
   export async function dangerousGetDonor(id: number) {
     return await db.select().from(donors).where(eq(donors.id, id));
   }
   
   // ✅ SECURE - Always include organization verification  
   export async function secureGetDonor(id: number, organizationId: string) {
     return await db.select().from(donors)
       .where(and(eq(donors.id, id), eq(donors.organizationId, organizationId)));
   }
   ```

2. **Inconsistent Context Usage in tRPC**
   ```typescript
   // ❌ WRONG - Not using the organization from context
   getById: protectedProcedure.input(donorIdSchema).query(async ({ input }) => {
     return await getDonorById(input.id, "some-hardcoded-org");
   });
   
   // ✅ CORRECT - Always use organizationId from context
   getById: protectedProcedure.input(donorIdSchema).query(async ({ input, ctx }) => {
     return await getDonorById(input.id, ctx.auth.user.organizationId);
   });
   ```

3. **Missing Staff Verification for Assignments**
   ```typescript
   // ❌ VULNERABILITY - Staff could be assigned across organizations
   if (staffId !== null) {
     // Missing: verify staff belongs to same organization
     const updatedDonor = await updateDonor(donorId, { assignedToStaffId: staffId });
   }
   
   // ✅ SECURE - Always verify staff belongs to organization
   if (staffId !== null) {
     const staff = await getStaffById(staffId, organizationId);
     if (!staff) {
       throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found in your organization" });
     }
   }
   ```

### Authorization Pattern Requirements

1. **Always use `protectedProcedure` for authenticated endpoints**
2. **Use `adminProcedure` for admin-only operations**
3. **Verify resource ownership before any operation**
4. **Include organization checks in all database queries**
5. **Use the `BackendUser` type from context for type safety**

## 🔧 TypeScript and Type Safety Pitfalls

### Drizzle ORM Type Safety Gotchas

1. **Dangerous Type Casting**
   ```typescript
   // ❌ WRONG - Losing type safety with any
   const donors = await db.select().from(donors) as any;
   
   // ❌ WRONG - Unsafe casting without verification
   const donor = result[0] as Donor;
   
   // ✅ CORRECT - Proper type checking and optional handling
   const result = await db.select().from(donors);
   const donor: Donor | undefined = result[0];
   if (!donor) {
     throw new TRPCError({ code: "NOT_FOUND" });
   }
   ```

2. **Missing Zod Validation**
   ```typescript
   // ❌ WRONG - No input validation
   export const unsafeRouter = router({
     update: protectedProcedure.mutation(async ({ input }) => {
       // input could be anything!
       return await updateDonor(input.id, input.data);
     })
   });
   
   // ✅ CORRECT - Always validate inputs with Zod
   const updateDonorSchema = z.object({
     id: z.number(),
     email: z.string().email().optional(),
     firstName: z.string().optional(),
   });
   
   export const safeRouter = router({
     update: protectedProcedure
       .input(updateDonorSchema)
       .mutation(async ({ input, ctx }) => {
         return await updateDonor(input.id, input, ctx.auth.user.organizationId);
       })
   });
   ```

3. **Inconsistent Date Handling**
   ```typescript
   // ❌ PROBLEMATIC - Date serialization issues
   const donorSchema = z.object({
     createdAt: z.date(), // Might cause serialization problems
   });
   
   // ✅ BETTER - Transform dates to strings for API responses
   const donorSchema = z.object({
     createdAt: z.date().transform((d) => d.toISOString()),
   });
   ```

### tRPC Type Safety Mistakes

1. **Not Using Output Schemas**
   ```typescript
   // ❌ MISSING - No output validation
   list: protectedProcedure.input(listSchema).query(async ({ input, ctx }) => {
     return await listDonors(input, ctx.auth.user.organizationId);
   });
   
   // ✅ COMPLETE - Input AND output validation
   list: protectedProcedure
     .input(listDonorsSchema)
     .output(listDonorsOutputSchema) // Ensures response type safety
     .query(async ({ input, ctx }) => {
       return await listDonors(input, ctx.auth.user.organizationId);
     });
   ```

2. **Forgetting Error Type Safety**
   ```typescript
   // ❌ UNSAFE - Generic error throwing
   if (!donor) {
     throw new Error("Not found");
   }
   
   // ✅ SAFE - Typed TRPC errors
   if (!donor) {
     throw new TRPCError({
       code: "NOT_FOUND",
       message: "Donor not found",
     });
   }
   ```

## 🗄️ Database and ORM Gotchas

### Drizzle ORM Common Mistakes

1. **Forgetting Transaction Boundaries**
   ```typescript
   // ❌ DANGEROUS - Multiple operations without transaction
   async function transferDonorUnsafe(donorId: number, fromListId: number, toListId: number) {
     await db.delete(donorListMembers).where(eq(donorListMembers.donorId, donorId));
     await db.insert(donorListMembers).values({ donorId, listId: toListId });
     // If second operation fails, donor is lost!
   }
   
   // ✅ SAFE - Use transactions for related operations  
   async function transferDonorSafe(donorId: number, fromListId: number, toListId: number) {
     await db.transaction(async (tx) => {
       await tx.delete(donorListMembers)
         .where(and(
           eq(donorListMembers.donorId, donorId),
           eq(donorListMembers.listId, fromListId)
         ));
       await tx.insert(donorListMembers).values({ donorId, listId: toListId });
     });
   }
   ```

2. **N+1 Query Problems**
   ```typescript
   // ❌ INEFFICIENT - N+1 queries
   const donors = await db.select().from(donors);
   for (const donor of donors) {
     const staff = await db.select().from(staff).where(eq(staff.id, donor.assignedToStaffId));
   }
   
   // ✅ EFFICIENT - Use relations or joins
   const donorsWithStaff = await db.query.donors.findMany({
     with: {
       assignedStaff: true,
     },
   });
   ```

3. **Improper Bulk Operations**
   ```typescript
   // ❌ SLOW - Individual operations in loop
   for (const donorId of donorIds) {
     await db.update(donors)
       .set({ assignedToStaffId: staffId })
       .where(eq(donors.id, donorId));
   }
   
   // ✅ FAST - Single bulk operation
   await db.update(donors)
     .set({ assignedToStaffId: staffId })
     .where(inArray(donors.id, donorIds));
   ```

### Performance Issues to Watch For

1. **Missing Database Indexes** - Ensure queries on `organizationId` are indexed
2. **Large Result Sets** - Always implement pagination for list operations
3. **Inefficient JSON Queries** - Be careful with complex `jsonb` operations
4. **Missing Query Limits** - Always include `.limit()` for safety

### Migration and Schema Change Gotchas

1. **Breaking Changes Without Migrations**
   ```typescript
   // ❌ DANGEROUS - Changing column types without migration
   // OLD: age: integer("age")
   // NEW: age: varchar("age", { length: 3 })
   // This will break production without proper migration!
   ```

2. **Missing NOT NULL Constraints**
   ```typescript
   // ❌ RISKY - Adding required fields without defaults
   organizationId: text("organization_id").notNull(), // Will fail on existing records
   
   // ✅ SAFE - Add with default or make optional first
   organizationId: text("organization_id").notNull().default("temp-org-id"),
   ```

## 🤖 AI Integration Mistakes

### Token Usage and Rate Limiting Gotchas

1. **Unbounded Context Building**
   ```typescript
   // ❌ DANGEROUS - Could exceed token limits
   const prompt = `
     ${allDonorHistory} // Could be massive
     ${allCommunications} // Could be thousands of messages
     ${allPersonalMemories} // Unlimited array
   `;
   
   // ✅ SAFE - Limit and prioritize context
   const recentCommunications = communications.slice(-10); // Only last 10
   const relevantMemories = memories.slice(0, 5); // Top 5 memories
   ```

2. **Missing Rate Limit Handling**
   ```typescript
   // ❌ FRAGILE - No rate limit handling
   const response = await openai.chat.completions.create({
     model: "gpt-4",
     messages: messages,
   });
   
   // ✅ ROBUST - Handle rate limits with retries
   async function generateWithRetry(messages: any[], maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await openai.chat.completions.create({
           model: "gpt-4", 
           messages: messages,
         });
       } catch (error) {
         if (error.status === 429 && i < maxRetries - 1) {
           await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
           continue;
         }
         throw error;
       }
     }
   }
   ```

3. **Improper Error Handling for AI Services**
   ```typescript
   // ❌ BRITTLE - Generic error handling
   try {
     const result = await generateEmail(donor, instruction);
   } catch (error) {
     throw error; // Loses context about which AI service failed
   }
   
   // ✅ ROBUST - Specific AI error handling
   try {
     const result = await generateEmail(donor, instruction);
   } catch (error) {
     logger.error(`Email generation failed for donor ${donor.id}`, {
       error: error.message,
       donorId: donor.id,
       instruction: instruction.substring(0, 100),
     });
     
     if (error.status === 429) {
       throw new TRPCError({ 
         code: "TOO_MANY_REQUESTS", 
         message: "AI service temporarily unavailable" 
       });
     }
     throw new TRPCError({ 
       code: "INTERNAL_SERVER_ERROR", 
       message: "Failed to generate email" 
     });
   }
   ```

### Prompt Engineering Pitfalls

1. **Unstable Prompt Construction**
2. **Missing Context Validation**
3. **Inconsistent Output Parsing**

## ⚡ Background Job Pitfalls

### Trigger.dev Job Implementation Mistakes

1. **Missing Concurrency Control**
   ```typescript
   // ❌ DANGEROUS - Could overwhelm external APIs
   const promises = donors.map(donor => generateEmailForDonor(donor));
   await Promise.all(promises); // All at once!
   
   // ✅ SAFE - Controlled concurrency
   async function processConcurrently<T, R>(
     items: T[],
     processor: (item: T) => Promise<R>,
     maxConcurrency: number = 10
   ): Promise<R[]> {
     const results: R[] = [];
     for (let i = 0; i < items.length; i += maxConcurrency) {
       const batch = items.slice(i, i + maxConcurrency);
       const batchResults = await Promise.all(batch.map(processor));
       results.push(...batchResults);
     }
     return results;
   }
   ```

2. **Improper State Management**
   ```typescript
   // ❌ RISKY - No progress tracking
   export const bulkEmailTask = task({
     id: "bulk-email",
     run: async (payload) => {
       // Process all donors without updating progress
       for (const donor of donors) {
         await generateEmail(donor);
       }
     }
   });
   
   // ✅ ROBUST - Progress tracking and recovery
   export const bulkEmailTask = task({
     id: "bulk-email", 
     run: async (payload) => {
       // Update session status to GENERATING
       await updateSessionStatus(payload.sessionId, "GENERATING");
       
       let completed = 0;
       for (const donor of donors) {
         try {
           await generateEmail(donor);
           completed++;
           
           // Update progress every 10 donors
           if (completed % 10 === 0) {
             await updateSessionProgress(payload.sessionId, completed);
           }
         } catch (error) {
           // Handle individual failures without stopping entire job
           logger.error(`Failed to generate email for donor ${donor.id}`, error);
         }
       }
       
       await updateSessionStatus(payload.sessionId, "COMPLETED");
     }
   });
   ```

3. **Missing Idempotency**
   ```typescript
   // ❌ DANGEROUS - Could create duplicates on retry
   export const emailTask = task({
     run: async (payload) => {
       await db.insert(generatedEmails).values({
         donorId: payload.donorId,
         content: payload.content,
       });
     }
   });
   
   // ✅ SAFE - Idempotent operations
   export const emailTask = task({
     run: async (payload) => {
       // Check if already exists
       const existing = await db.select()
         .from(generatedEmails)
         .where(and(
           eq(generatedEmails.donorId, payload.donorId),
           eq(generatedEmails.sessionId, payload.sessionId)
         ));
         
       if (existing.length === 0) {
         await db.insert(generatedEmails).values({
           donorId: payload.donorId,
           sessionId: payload.sessionId,
           content: payload.content,
         });
       }
     }
   });
   ```

### Job Failure and Retry Pitfalls

1. **No Exponential Backoff**
2. **Missing Dead Letter Queue Handling**
3. **Resource Cleanup on Failure**

## ⚛️ Next.js and React Gotchas

### Server vs Client Component Mistakes

1. **Using Server-Only Code in Client Components**
   ```typescript
   // ❌ ERROR - Database in client component
   "use client";
   import { db } from "@/app/lib/db"; // Will fail!
   
   export function MyComponent() {
     // Client component cannot access server-only modules
   }
   
   // ✅ CORRECT - Use tRPC hooks for data fetching
   "use client";
   import { api } from "@/app/lib/api";
   
   export function MyComponent() {
     const { data: donors } = api.donors.list.useQuery();
   }
   ```

2. **Incorrect Hook Usage in Server Components**
   ```typescript
   // ❌ ERROR - Hooks in server component
   export default function ServerPage() {
     const [state, setState] = useState(); // Hooks not allowed!
     return <div>Content</div>;
   }
   
   // ✅ CORRECT - Server component without hooks
   export default function ServerPage() {
     return <div>Content</div>;
   }
   ```

### State Management Pitfalls

1. **Unnecessary State for Derived Values**
   ```typescript
   // ❌ INEFFICIENT - Redundant state
   const [donors, setDonors] = useState([]);
   const [donorCount, setDonorCount] = useState(0);
   
   useEffect(() => {
     setDonorCount(donors.length); // Unnecessary!
   }, [donors]);
   
   // ✅ EFFICIENT - Derived value
   const [donors, setDonors] = useState([]);
   const donorCount = donors.length; // Computed on each render
   ```

2. **Missing Dependency Arrays**
   ```typescript
   // ❌ BUG - Missing dependencies
   useEffect(() => {
     fetchData(userId, organizationId);
   }, []); // Missing userId, organizationId dependencies!
   
   // ✅ CORRECT - Include all dependencies
   useEffect(() => {
     fetchData(userId, organizationId);
   }, [userId, organizationId]);
   ```

3. **Race Conditions in Effects**
   ```typescript
   // ❌ RACE CONDITION - Multiple requests
   useEffect(() => {
     fetchDonors().then(setDonors);
   }, [searchTerm]); // If searchTerm changes quickly, responses might arrive out of order
   
   // ✅ SAFE - Cleanup pattern
   useEffect(() => {
     let cancelled = false;
     
     fetchDonors().then(result => {
       if (!cancelled) {
         setDonors(result);
       }
     });
     
     return () => { cancelled = true; };
   }, [searchTerm]);
   ```

### Performance Optimization Mistakes

1. **Missing React.memo for Expensive Components**
2. **Not Using useMemo for Expensive Calculations**
3. **Unnecessary Re-renders Due to Object/Array Dependencies**

## 🧪 Testing Pitfalls

### Mock Implementation Gotchas

1. **Incomplete Router Mocking**
   ```typescript
   // ❌ INCOMPLETE - Missing router methods
   jest.mock('next/navigation', () => ({
     useRouter: () => ({
       push: jest.fn(),
       // Missing: back, forward, refresh, etc.
     }),
   }));
   
   // ✅ COMPLETE - Full router mock
   jest.mock('next/navigation', () => ({
     useRouter: () => ({
       push: jest.fn(),
       back: jest.fn(),
       forward: jest.fn(),
       refresh: jest.fn(),
       replace: jest.fn(),
       prefetch: jest.fn(),
     }),
   }));
   ```

2. **Missing tRPC Mock Setup**
   ```typescript
   // ❌ MISSING - No tRPC mocking
   import { api } from "@/app/lib/api";
   // Component uses api.donors.list.useQuery() but it's not mocked!
   
   // ✅ MOCKED - Proper tRPC testing setup
   jest.mock('@/app/lib/api', () => ({
     api: {
       donors: {
         list: {
           useQuery: jest.fn(() => ({
             data: [],
             isLoading: false,
             error: null,
           })),
         },
       },
     },
   }));
   ```

### E2E Test Reliability Issues

1. **Hardcoded Test Data Dependencies**
2. **Race Conditions in Async Operations**
3. **Insufficient Cleanup Between Tests**

### Coverage Blind Spots

1. **Error Boundary Testing**
2. **Background Job Error Scenarios**  
3. **Multi-tenant Data Isolation**

## 🔧 Environment and Configuration Gotchas

### Environment Variable Issues

1. **Missing Runtime Environment Mapping**
   ```typescript
   // ❌ MISSING - Environment variable not mapped
   server: {
     NEW_API_KEY: z.string().min(1),
   },
   // But forgot to add to runtimeEnv!
   
   // ✅ COMPLETE - Always add to runtimeEnv
   server: {
     NEW_API_KEY: z.string().min(1),
   },
   runtimeEnv: {
     NEW_API_KEY: process.env.NEW_API_KEY,
   },
   ```

2. **Client/Server Environment Confusion**
   ```typescript
   // ❌ ERROR - Server env var accessed on client
   const apiKey = env.OPENAI_API_KEY; // This will fail on client side!
   
   // ✅ CORRECT - Use appropriate environment variables
   const publicKey = env.NEXT_PUBLIC_PUBLISHABLE_KEY; // Client-safe
   ```

## 🛡️ Security Best Practices Summary

1. **ALWAYS verify organization access in database queries**
2. **Use protectedProcedure for all authenticated endpoints**
3. **Validate all inputs with Zod schemas**
4. **Include organization checks in all resource operations**
5. **Never trust user input without validation**
6. **Use transactions for multi-table operations**
7. **Implement proper error handling without leaking sensitive information**
8. **Rate limit AI API calls**
9. **Use environment variables for all secrets**
10. **Log security-relevant events for auditing**

## 🚀 Performance Best Practices Summary

1. **Implement pagination for all list operations**
2. **Use database indexes for common query patterns**
3. **Batch database operations where possible**
4. **Control concurrency in background jobs**
5. **Use React.memo and useMemo appropriately**
6. **Optimize AI context to stay within token limits**
7. **Cache expensive computations**
8. **Use efficient database queries with proper joins**
9. **Monitor and log performance metrics**
10. **Implement proper loading states and error boundaries**

---

**Remember**: This is a multi-tenant SaaS application. Organization-scoped security is not optional—it's critical for data protection and regulatory compliance.