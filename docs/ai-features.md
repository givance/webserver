# AI Features Documentation

This document provides comprehensive documentation for all AI-powered features in the Givance platform, including implementation details, prompts, and best practices.

## Table of Contents
- [Overview](#overview)
- [AI Email Generation](#ai-email-generation)
- [Agentic Email Generation](#agentic-email-generation)
- [Donor Research](#donor-research)
- [Donor Journey Analysis](#donor-journey-analysis)
- [AI-Powered Action Predictions](#ai-powered-action-predictions)
- [WhatsApp AI Assistant](#whatsapp-ai-assistant)
- [Email Signature Management](#email-signature-management)
- [Email Scheduling Optimization](#email-scheduling-optimization)
- [AI Configuration](#ai-configuration)
- [Token Management](#token-management)
- [Prompt Engineering](#prompt-engineering)
- [Performance Optimization](#performance-optimization)

## Overview

Givance leverages multiple AI providers to deliver intelligent features:

- **OpenAI GPT-4**: Primary model for email generation and complex reasoning
- **Anthropic Claude**: Alternative model for generation and analysis
- **Azure OpenAI**: Enterprise deployment option
- **OpenAI Embeddings**: Semantic search and similarity matching

### Core AI Services

1. **AgenticEmailGenerationService**: Conversational email campaign creation
2. **PersonResearchService**: Web-based donor research and analysis
3. **DonorJourneyService**: Journey stage classification and predictions
4. **WhatsAppAIService**: Natural language query processing with voice support
5. **StageClassificationService**: AI-powered donor stage analysis
6. **ActionPredictionService**: Generates actionable recommendations
7. **EmailSchedulingService**: AI-optimized email timing
8. **TodoService**: Converts AI predictions to actionable tasks

## AI Email Generation

### Traditional Email Generation

The standard email generation uses a single-step approach with predefined instructions.

### Agentic Email Generation

The agentic system uses a multi-step conversational approach:

```typescript
// src/app/lib/services/agenticEmailGeneration.service.ts

class AgenticEmailGenerationService {
  // Step 1: Understand campaign goals
  async startConversation(sessionId: string, userMessage: string)
  
  // Step 2: Refine instructions iteratively
  async continueConversation(sessionId: string, userMessage: string)
  
  // Step 3: Generate emails with context
  async generateEmail(donorId: string, instructions: string)
}
```

### Email Generation Flow

1. **Context Gathering**
   - Organization AI instructions
   - Donor communication history
   - Recent donations and interactions
   - Project/campaign details

2. **Prompt Construction**
   ```typescript
   const prompt = `
   You are writing a personalized email on behalf of ${organization.name}.
   
   Organization Context:
   ${organization.aiInstructions}
   
   Donor Information:
   - Name: ${donor.firstName} ${donor.lastName}
   - Giving History: ${donationSummary}
   - Last Contact: ${lastCommunication}
   - Interests: ${donor.interests}
   
   Campaign Instructions:
   ${campaignInstructions}
   
   Previous Communications:
   ${recentEmails}
   
   Generate a personalized email that:
   1. Acknowledges their past support
   2. Connects to their interests
   3. Makes a specific ask
   4. Maintains the organization's voice
   `;
   ```

3. **Structured Output**
   ```typescript
   interface GeneratedEmail {
     subject: string;
     salutation: string;
     paragraphs: Array<{
       content: string;
       type: 'greeting' | 'context' | 'ask' | 'closing';
       references: string[]; // What donor info was used
     }>;
     signature: string;
     metadata: {
       donorContextUsed: string[];
       personalizationScore: number;
       tokensUsed: number;
     };
   }
   ```

### Bulk Generation Strategy

For large campaigns, emails are generated in parallel batches:

```typescript
// src/trigger/jobs/generateBulkEmails.ts

const BATCH_SIZE = 10;
const MAX_CONCURRENT = 5;

async function processBatch(donors: Donor[], instructions: string) {
  const promises = donors.map(donor => 
    generateEmailWithRetry(donor, instructions)
  );
  
  return Promise.allSettled(promises);
}
```

### Quality Assurance

1. **Content Validation**
   - No sensitive information exposure
   - Appropriate tone and ask amounts
   - Factual accuracy verification

2. **Personalization Metrics**
   - Track which donor data was used
   - Score personalization level (1-10)
   - Flag generic content

3. **A/B Testing Support**
   - Generate variants with different styles
   - Track performance by variant

## Donor Research

### Research Pipeline

The donor research system performs multi-step web research:

```typescript
// src/app/lib/services/personResearch.service.ts

class PersonResearchService {
  // Step 1: Identity search
  async searchPerson(name: string, location?: string)
  
  // Step 2: Result verification
  async verifyIdentity(searchResults: SearchResult[], knownInfo: DonorInfo)
  
  // Step 3: Deep research
  async analyzeResults(verifiedResults: SearchResult[])
  
  // Step 4: Capacity assessment
  async assessGivingCapacity(researchData: ResearchData)
}
```

### Search Strategy

1. **Query Generation**
   ```typescript
   const queries = [
     `"${firstName} ${lastName}" ${city} ${state}`,
     `"${firstName} ${lastName}" ${employer}`,
     `"${firstName} ${lastName}" nonprofit donation`,
     `"${firstName} ${lastName}" "${spouseName}"` // For couples
   ];
   ```

2. **Source Prioritization**
   - LinkedIn profiles (employment, education)
   - Company websites (executive bios)
   - News articles (wealth indicators)
   - Public records (property, businesses)
   - Social media (interests, connections)

3. **Information Extraction**
   ```typescript
   const extractionPrompt = `
   Extract the following information from the search results:
   
   1. Age/Birth Year
   2. Current Employer and Position
   3. Previous Employers
   4. Education Background
   5. Board Memberships
   6. Charitable Interests
   7. Wealth Indicators (property, business ownership, etc.)
   8. Family Information
   9. Hobbies/Interests
   
   For each piece of information, provide:
   - The extracted data
   - Confidence level (high/medium/low)
   - Source URL
   - Relevant quote from source
   `;
   ```

### Giving Capacity Assessment

```typescript
interface GivingCapacityFactors {
  estimatedIncome?: number;
  jobTitle?: string;
  propertyValue?: number;
  businessOwnership?: boolean;
  boardMemberships?: string[];
  previousDonations?: number;
  peerGiving?: number; // Similar donors' giving
}

function assessCapacity(factors: GivingCapacityFactors): GivingCapacity {
  // Scoring algorithm based on:
  // - Income percentile
  // - Wealth indicators
  // - Philanthropic involvement
  // - Historical giving patterns
  
  return {
    level: 'high', // low, medium, high, major
    suggestedAsk: calculateAskAmount(factors),
    confidence: 0.85,
    reasoning: "Based on executive position and board memberships..."
  };
}
```

### Research Versioning

All research is versioned to track changes over time:

```sql
-- Each research run creates a new version
INSERT INTO person_research (
  donor_id,
  version,
  status,
  data,
  sources
) VALUES (?, ?, 'completed', ?, ?);
```

## Donor Journey Analysis

### Advanced Stage Classification Pipeline

The platform includes a sophisticated AI pipeline for donor journey management:

```typescript
// src/app/lib/analysis/stage-classification-service.ts

export class StageClassificationService {
  async classifyDonorStage(donor: Donor): Promise<StageClassification> {
    const prompt = await this.promptBuilder.buildStageClassificationPrompt(
      donor,
      donorHistory,
      organizationContext
    );
    
    const result = await this.aiService.generateStructuredOutput({
      prompt,
      schema: stageClassificationSchema,
    });
    
    // Update database with new stage
    if (result.suggestedStage !== donor.currentStage) {
      await this.updateDonorStage(donor.id, result);
    }
    
    return result;
  }
}
```

### Stage Transition Management

```typescript
// src/app/lib/analysis/stage-transition-service.ts

export class StageTransitionService {
  async processStageTransition(
    donorId: string,
    newStage: string,
    reasoning: string
  ): Promise<void> {
    // Record transition history
    await this.recordTransition(donorId, oldStage, newStage);
    
    // Trigger automated actions
    await this.triggerStageActions(donorId, newStage);
    
    // Create follow-up tasks
    await this.createTransitionTasks(donorId, newStage);
  }
}
```

### Journey Stage Classification

The system uses AI to classify donors into journey stages:

```typescript
// src/app/lib/services/donorJourney.service.ts

async function classifyDonorStage(donor: Donor): Promise<StageClassification> {
  const context = await gatherDonorContext(donor);
  
  const prompt = `
  Based on the donor journey stages defined below and the donor's history,
  determine their current stage:
  
  Journey Stages:
  ${JSON.stringify(organization.donorJourneyGraph.stages)}
  
  Donor Context:
  - Total Donations: ${context.totalDonations}
  - Donation Count: ${context.donationCount}
  - Last Contact: ${context.lastContact}
  - Engagement Level: ${context.engagementScore}
  - Communication History: ${context.recentCommunications}
  
  Classify the donor's current stage and explain your reasoning.
  Also identify potential next stages and likelihood of transition.
  `;
  
  return await classifyWithAI(prompt);
}
```

### Predictive Actions

AI generates recommended actions based on donor stage:

```typescript
interface PredictedAction {
  action: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  deadline?: Date;
  expectedOutcome: string;
  successProbability: number;
}

async function predictNextActions(donor: Donor): Promise<PredictedAction[]> {
  const stageTransitions = getStageTransitions(donor.journeyStage);
  
  const prompt = `
  Generate 3-5 recommended actions to move this donor forward:
  
  Current Stage: ${donor.journeyStage}
  Possible Transitions: ${stageTransitions}
  Recent Interactions: ${recentHistory}
  
  For each action, provide:
  1. Specific action to take
  2. Why this action is recommended
  3. Expected outcome
  4. Optimal timing
  5. Success probability
  `;
  
  return await generateActionsWithAI(prompt);
}
```

### Journey Optimization

The system learns from successful transitions:

```typescript
// Track transition success
async function recordTransition(
  donorId: string,
  fromStage: string,
  toStage: string,
  triggerAction: string
) {
  // Store for pattern analysis
  await db.insert(stageTransitions).values({
    donorId,
    fromStage,
    toStage,
    triggerAction,
    timestamp: new Date()
  });
  
  // Update AI model context
  await updateJourneyPatterns();
}
```

## AI-Powered Action Predictions

### Predictive Action Generation

The system generates specific, actionable recommendations for each donor:

```typescript
// src/app/lib/analysis/action-prediction-service.ts

export class ActionPredictionService {
  async predictActions(donor: Donor): Promise<PredictedAction[]> {
    const prompt = await this.promptBuilder.buildActionPredictionPrompt(
      donor,
      donorHistory,
      stageInfo
    );
    
    const predictions = await this.aiService.generateStructuredOutput({
      prompt,
      schema: actionPredictionSchema,
    });
    
    // Convert to TODO items
    await this.todoService.createTodosFromPredictedActions(
      predictions.actions,
      donor
    );
    
    return predictions.actions;
  }
}
```

### TODO Generation from AI

AI predictions automatically become actionable tasks:

```typescript
// src/app/lib/services/todo-service.ts

async createTodosFromPredictedActions(
  actions: PredictedAction[],
  donor: Donor
): Promise<void> {
  for (const action of actions) {
    await this.createTodo({
      title: action.action,
      description: action.reasoning,
      donorId: donor.id,
      assigneeId: donor.assignedStaffId,
      priority: action.priority,
      dueDate: action.deadline,
      aiGenerated: true,
      metadata: {
        expectedOutcome: action.expectedOutcome,
        successProbability: action.successProbability,
      },
    });
  }
}
```

## WhatsApp AI Assistant

### Voice Message Transcription

The assistant supports voice messages through OpenAI Whisper:

```typescript
// src/app/api/whatsapp/webhook/route.ts

if (messageType === 'audio') {
  const audioUrl = message.audio.url;
  const transcription = await transcribeAudio(audioUrl);
  
  // Process transcribed text as regular query
  await processWhatsAppQuery(transcription, senderId);
}
```

### Advanced Donor Insights Tools

The platform includes specialized AI tools for donor analysis:

```typescript
// src/app/lib/services/whatsapp/donor-action-insights-tool.ts

export const donorActionInsightsTool = {
  name: 'donor_action_insights',
  description: 'Analyzes donor patterns and suggests actions',
  
  execute: async (params) => {
    const insights = await analyzeDonorPatterns(params.donorId);
    
    return {
      riskLevel: insights.churnRisk,
      seasonalPatterns: insights.givingSeasons,
      communicationGaps: insights.contactGaps,
      recommendedActions: insights.actions,
      priorityScore: insights.priority,
    };
  },
};
```

### Natural Language Processing

The WhatsApp assistant translates natural language to database queries:

```typescript
// src/app/lib/services/whatsappAI.service.ts

async function processQuery(query: string): Promise<QueryResponse> {
  // Step 1: Understand intent
  const intent = await classifyIntent(query);
  
  // Step 2: Extract entities
  const entities = await extractEntities(query);
  
  // Step 3: Generate SQL or API call
  const dbQuery = await generateQuery(intent, entities);
  
  // Step 4: Execute and format response
  const results = await executeQuery(dbQuery);
  
  return formatResponse(results, intent);
}
```

### Query Examples

1. **Donor Search**
   - Input: "Show me major donors who haven't been contacted in 30 days"
   - Generated SQL:
   ```sql
   SELECT d.*, 
          COALESCE(SUM(don.amount), 0) as total_donated
   FROM donors d
   LEFT JOIN donations don ON d.id = don.donor_id
   LEFT JOIN communications c ON d.id = c.donor_id
   WHERE d.organization_id = ?
   GROUP BY d.id
   HAVING COALESCE(SUM(don.amount), 0) > 10000
   AND (MAX(c.created_at) < NOW() - INTERVAL '30 days' 
        OR MAX(c.created_at) IS NULL)
   ORDER BY total_donated DESC;
   ```

2. **Analytics Queries**
   - Input: "What's our donation trend this month vs last month?"
   - Response includes:
     - Total amounts
     - Donor counts
     - Average donation size
     - Trend visualization

## Email Signature Management

### Intelligent Signature Selection

The system uses AI to select appropriate signatures:

```typescript
// src/app/lib/utils/email-with-signature.ts

export async function getSignatureForEmail(
  donor: Donor,
  campaign: Campaign,
  user: User
): Promise<string> {
  // Hierarchical selection logic
  // 1. Custom signature for campaign
  // 2. Assigned staff signature
  // 3. Primary staff signature
  // 4. User fallback
  
  const signature = await intelligentSignatureSelection({
    donor,
    campaign,
    user,
    context: await gatherContext(donor),
  });
  
  return signature;
}
```

### Rich Text Signature Editor

AI-enhanced signature creation with image processing:

```typescript
// src/components/signature/SignatureEditor.tsx

// Advanced clipboard processing for Gmail compatibility
const processClipboardImage = async (file: File) => {
  const optimized = await optimizeImageForEmail(file);
  const base64 = await convertToBase64(optimized);
  
  // AI-powered image analysis
  const analysis = await analyzeSignatureImage(base64);
  
  if (analysis.inappropriate) {
    throw new Error('Image not suitable for signature');
  }
  
  return base64;
};
```

## Email Scheduling Optimization

### AI-Powered Send Time Optimization

The scheduling service uses AI to determine optimal send times:

```typescript
// src/app/lib/services/email-scheduling.service.ts

export class EmailSchedulingService {
  async calculateOptimalSendTime(
    donor: Donor,
    campaign: Campaign
  ): Promise<Date> {
    const factors = {
      donorTimezone: donor.timezone,
      historicalOpenTimes: await this.getOpenHistory(donor.id),
      campaignType: campaign.type,
      dayOfWeek: this.getOptimalDays(donor),
    };
    
    const optimalTime = await this.aiService.predictBestSendTime(factors);
    
    // Apply constraints
    return this.applySchedulingConstraints(optimalTime, {
      dailyLimit: campaign.dailyLimit,
      minGapHours: campaign.minGapHours,
      businessHours: campaign.respectBusinessHours,
    });
  }
}
```

### Intelligent Campaign Distribution

```typescript
async distributeEmailsOverTime(
  emails: Email[],
  constraints: SchedulingConstraints
): Promise<ScheduledEmail[]> {
  // AI groups similar donors
  const donorClusters = await this.clusterDonorsByBehavior(emails);
  
  // Optimize send times per cluster
  return this.optimizeClusterScheduling(donorClusters, constraints);
}
```

## Agentic Email Generation

### Instruction Refinement Agent

The system includes an AI agent for improving email instructions:

```typescript
// src/app/lib/utils/email-generator/instruction-agent.ts

export class InstructionRefinementAgent {
  async refineInstructions(
    initialInstructions: string,
    feedback: string,
    context: CampaignContext
  ): Promise<RefinedInstructions> {
    const conversationHistory = await this.getHistory(context.sessionId);
    
    const refinedPrompt = `
    Current Instructions: ${initialInstructions}
    User Feedback: ${feedback}
    Campaign Context: ${JSON.stringify(context)}
    Previous Refinements: ${conversationHistory}
    
    Improve the instructions based on feedback while:
    1. Maintaining consistency with organization voice
    2. Addressing the user's concerns
    3. Keeping personalization capabilities
    4. Ensuring clarity for AI generation
    `;
    
    return await this.generateRefinement(refinedPrompt);
  }
}
```

### Conversational Flow Management

```typescript
export class AgenticEmailGenerationService {
  async manageConversation(
    sessionId: string,
    userMessage: string
  ): Promise<ConversationResponse> {
    const state = await this.getConversationState(sessionId);
    
    switch (state.phase) {
      case 'understanding':
        return this.clarifyRequirements(userMessage, state);
      
      case 'refining':
        return this.refineInstructions(userMessage, state);
      
      case 'generating':
        return this.generateEmails(state.finalInstructions);
    }
  }
}
```
     - Percentage change

3. **Action Queries**
   - Input: "Create a todo to call John Smith tomorrow"
   - Creates todo with:
     - Donor reference
     - Due date parsing
     - Priority inference

### Voice Message Support

```typescript
async function processVoiceMessage(audioBuffer: Buffer): Promise<string> {
  // Step 1: Transcribe audio
  const transcription = await openai.audio.transcriptions.create({
    file: audioBuffer,
    model: "whisper-1",
    language: "en"
  });
  
  // Step 2: Process as text query
  return await processQuery(transcription.text);
}
```

## AI Configuration

### Organization-Level Instructions

Each organization can customize AI behavior:

```typescript
interface OrganizationAIConfig {
  // Global instructions for all AI features
  aiInstructions: string;
  
  // Feature-specific overrides
  emailGenerationStyle?: {
    tone: 'formal' | 'casual' | 'warm';
    lengthPreference: 'concise' | 'detailed';
    personalizationLevel: 'high' | 'medium' | 'low';
  };
  
  // Restricted topics or information
  restrictions?: string[];
  
  // Custom terminology
  terminology?: Record<string, string>;
}
```

### Model Selection

```typescript
// src/app/lib/ai/models.ts

const MODEL_CONFIGS = {
  'gpt-4': {
    provider: 'openai',
    maxTokens: 8192,
    temperature: 0.7,
    costPer1kTokens: { input: 0.03, output: 0.06 }
  },
  'claude-3': {
    provider: 'anthropic',
    maxTokens: 100000,
    temperature: 0.7,
    costPer1kTokens: { input: 0.015, output: 0.075 }
  },
  'gpt-4-azure': {
    provider: 'azure',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    maxTokens: 8192,
    temperature: 0.7
  }
};

function selectModel(task: AITask): ModelConfig {
  // Selection based on:
  // - Task requirements (context length, complexity)
  // - Cost optimization
  // - Availability/rate limits
  // - Performance requirements
}
```

## Token Management

### Usage Tracking

All AI operations track token usage:

```typescript
interface TokenUsage {
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  organizationId: string;
  timestamp: Date;
}

async function trackTokenUsage(usage: TokenUsage) {
  // Store in database
  await db.insert(tokenUsageTable).values(usage);
  
  // Update organization limits
  await checkOrganizationLimits(usage.organizationId);
  
  // Alert if approaching limits
  if (await isApproachingLimit(usage.organizationId)) {
    await notifyOrganization(usage.organizationId);
  }
}
```

### Context Window Optimization

For large contexts, implement sliding window:

```typescript
function optimizeContext(
  fullContext: string,
  maxTokens: number
): string {
  // Priority order:
  // 1. Recent interactions
  // 2. Key donor information
  // 3. Historical context
  
  const sections = {
    critical: extractCriticalInfo(fullContext),
    recent: extractRecentInfo(fullContext),
    historical: extractHistoricalInfo(fullContext)
  };
  
  // Build context within token limit
  return buildOptimizedContext(sections, maxTokens);
}
```

## Prompt Engineering

### Best Practices

1. **Structured Prompts**
   ```typescript
   const PROMPT_TEMPLATE = `
   Role: ${role}
   Context: ${context}
   Task: ${task}
   Constraints: ${constraints}
   Output Format: ${outputFormat}
   
   ${additionalInstructions}
   
   Input: ${userInput}
   `;
   ```

2. **Few-Shot Examples**
   ```typescript
   const EMAIL_EXAMPLES = [
     {
       input: "Major donor, haven't donated in 6 months",
       output: "Dear John, I hope this finds you well..."
     },
     // More examples...
   ];
   ```

3. **Chain-of-Thought**
   ```typescript
   const REASONING_PROMPT = `
   Think through this step-by-step:
   1. Analyze the donor's giving history
   2. Identify their interests and motivations
   3. Determine appropriate ask amount
   4. Craft personalized message
   
   Show your reasoning for each step.
   `;
   ```

### Prompt Versioning

Track and test prompt performance:

```typescript
interface PromptVersion {
  id: string;
  feature: string;
  version: number;
  prompt: string;
  performance: {
    avgQuality: number;
    successRate: number;
    avgTokens: number;
  };
  active: boolean;
}
```

## Performance Optimization

### Caching Strategies

1. **Embedding Cache**
   ```typescript
   // Cache donor embeddings for similarity search
   const EMBEDDING_CACHE = new Map<string, number[]>();
   
   async function getDonorEmbedding(donorId: string): Promise<number[]> {
     if (EMBEDDING_CACHE.has(donorId)) {
       return EMBEDDING_CACHE.get(donorId);
     }
     
     const embedding = await generateEmbedding(donorContext);
     EMBEDDING_CACHE.set(donorId, embedding);
     
     return embedding;
   }
   ```

2. **Response Cache**
   ```typescript
   // Cache common queries
   const QUERY_CACHE = new LRUCache<string, any>({
     max: 1000,
     ttl: 1000 * 60 * 60 // 1 hour
   });
   ```

### Batch Processing

Optimize API calls through batching:

```typescript
class AIBatchProcessor {
  private queue: AIRequest[] = [];
  private processing = false;
  
  async add(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...request, resolve, reject });
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const batch = this.queue.splice(0, MAX_BATCH_SIZE);
    
    try {
      const responses = await this.processBatch(batch);
      batch.forEach((req, i) => req.resolve(responses[i]));
    } catch (error) {
      batch.forEach(req => req.reject(error));
    }
    
    this.processing = false;
    this.processQueue();
  }
}
```

### Rate Limiting

Implement intelligent rate limiting:

```typescript
class AIRateLimiter {
  private limits = {
    'gpt-4': { rpm: 500, tpm: 150000 },
    'claude-3': { rpm: 1000, tpm: 100000 }
  };
  
  async acquire(model: string, tokens: number): Promise<void> {
    const limit = this.limits[model];
    
    // Check rate limits
    if (await this.wouldExceedLimit(model, tokens)) {
      const waitTime = this.calculateWaitTime(model);
      await sleep(waitTime);
    }
    
    // Track usage
    await this.recordUsage(model, tokens);
  }
}
```

### Error Handling

Comprehensive error handling with fallbacks:

```typescript
async function generateWithFallback(
  prompt: string,
  primaryModel: string,
  fallbackModel: string
): Promise<string> {
  try {
    return await generate(prompt, primaryModel);
  } catch (error) {
    logger.warn(`Primary model failed: ${error.message}`);
    
    if (error.code === 'rate_limit_exceeded') {
      // Use fallback model
      return await generate(prompt, fallbackModel);
    } else if (error.code === 'context_length_exceeded') {
      // Reduce context and retry
      const reducedPrompt = optimizeContext(prompt, 0.8);
      return await generate(reducedPrompt, primaryModel);
    } else {
      throw error;
    }
  }
}
```

## Monitoring & Analytics

### AI Performance Metrics

Track key performance indicators:

```typescript
interface AIMetrics {
  feature: string;
  model: string;
  successRate: number;
  avgLatency: number;
  avgTokensUsed: number;
  avgCost: number;
  userSatisfaction?: number;
}

// Dashboard queries
const metrics = await db.query.aiMetrics.findMany({
  where: and(
    eq(aiMetrics.feature, 'email_generation'),
    gte(aiMetrics.timestamp, lastWeek)
  )
});
```

### Quality Assurance

Automated quality checks:

```typescript
async function evaluateGeneratedEmail(email: GeneratedEmail): Promise<QualityScore> {
  const checks = await Promise.all([
    checkPersonalization(email),
    checkToneConsistency(email),
    checkFactualAccuracy(email),
    checkAskApppropriateness(email)
  ]);
  
  return {
    overall: calculateOverallScore(checks),
    details: checks,
    flags: identifyIssues(checks)
  };
}
```

### A/B Testing

Test different AI strategies:

```typescript
interface AIExperiment {
  name: string;
  variants: Array<{
    name: string;
    config: AIConfig;
    weight: number;
  }>;
  metrics: string[];
  duration: number;
}

async function runExperiment(experiment: AIExperiment) {
  // Randomly assign users to variants
  // Track performance metrics
  // Statistical significance testing
  // Automatic winner selection
}
```