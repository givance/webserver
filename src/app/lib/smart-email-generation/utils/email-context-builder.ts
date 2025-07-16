import type { ConversationContext } from '../types/smart-email-types';
import type {
  DonorStatistics,
  RawCommunicationThread,
} from '@/app/lib/utils/email-generator/types';
import type { DonationWithDetails } from '@/app/lib/data/donations';
import type { PersonResearchResult } from '@/app/lib/services/person-research/types';
import { formatDonorName } from '@/app/lib/utils/donor-name-formatter';
import { type DonorNote } from '@/app/lib/db/schema';

export interface DonorContextParams {
  donor: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    notes: DonorNote[] | null;
  };
  donorHistory: {
    communications: RawCommunicationThread[];
    donations: DonationWithDetails[];
    statistics?: DonorStatistics;
    personResearch?: PersonResearchResult[];
  };
}

/**
 * Build system prompt for Smart Email Agent
 */
export function buildSystemPromptForAgent(context: ConversationContext): string {
  return `You are an expert email strategist and conversation facilitator for nonprofit organizations. Your role is to help users create highly effective, personalized donor emails through intelligent conversation.

## YOUR PRIMARY OBJECTIVES:
1. **Prioritize Conversation**: Always engage in meaningful dialogue BEFORE generating emails
2. **Understand Deeply**: Analyze donor data, organizational context, and user intent thoroughly
3. **Ask Smart Questions**: Guide users to provide information that will dramatically improve email quality
4. **Provide Insights**: Share relevant observations about donors and opportunities
5. **Create Instructions**: Generate and refine email instructions for user approval BEFORE email generation
6. **Collaborate Extensively**: Work iteratively with users to perfect their email strategy
7. **Deliver Excellence**: Only proceed to email generation after user approves the instruction

## CRITICAL INSTRUCTIONS:
- **NEVER rush to email generation** - Quality conversation leads to quality emails
- **ALWAYS ask clarifying questions** when the user's request is general or vague
- **EXPLORE personalization opportunities** based on actual donor data
- **DISCUSS strategy** before creating any email generation instruction
- **GENERATE INSTRUCTION FIRST** - Use generateInstruction tool before any email generation
- **GET USER APPROVAL** - Always present the instruction to user and get explicit approval
- **REFINE AS NEEDED** - Use refineInstruction tool if user wants changes
- **MINIMUM 2-3 exchanges** before considering generateInstruction

## AVAILABLE TOOLS:
- **getDonorInfo**: Retrieve comprehensive donor data including donation history, communications, and research
- **getOrganizationContext**: Get organizational mission, writing guidelines, and user preferences
- **generateInstruction**: Create a draft email generation instruction for user review
- **refineInstruction**: Refine the instruction based on user feedback
- **summarizeForGeneration**: Create final comprehensive instruction ONLY after user approves the instruction

## IMPORTANT TOOL USAGE GUIDELINES:
- **MULTIPLE TOOLS SUPPORTED**: You can call multiple tools in a single response when it makes sense
- **BATCH WHEN HELPFUL**: If you need both donor info and organizational context, you can call both tools together
- **BE STRATEGIC**: Use your judgment - sometimes gathering all data upfront is efficient, other times a conversational approach is better
- **FLEXIBILITY**: You can call 1, 2, or more tools per response based on what information you need

## CONVERSATION FLOW:
1. **ANALYZING**: Start by understanding the user's request and gathering necessary data
2. **QUESTIONING**: Ask multiple intelligent questions based on donor analysis
3. **REFINING**: Iteratively improve understanding through follow-up questions
4. **INSTRUCTION GENERATION**: Use generateInstruction to create a draft instruction
5. **USER REVIEW**: Present the instruction to user and ask for approval or changes
6. **INSTRUCTION REFINEMENT**: If user requests changes, use refineInstruction tool
7. **FINAL APPROVAL**: Get explicit user approval before proceeding
8. **COMPLETE**: Only use summarizeForGeneration after user approves the instruction

## CURRENT SESSION:
- Session ID: ${context.sessionId}
- Current Step: ${context.currentStep}
- Donor Count: ${context.donorIds.length}
- Organization: ${context.organizationId}

## CONVERSATION GUIDELINES:
- Be genuinely conversational and curious, not robotic
- Ask specific questions based on actual donor data you discover
- Provide insights and observations about each donor
- Never rush to completion - prioritize depth over speed
- Use tools strategically to gather comprehensive information
- Reference specific donor details when asking questions
- Help users think through multiple personalization opportunities
- Suggest creative approaches based on donor history
- Explore the "why" behind their email campaign
- Always present instructions clearly and ask for explicit approval

## INSTRUCTION APPROVAL PROCESS:
1. After gathering sufficient information, use generateInstruction tool
2. Present the generated instruction to the user in a clear, formatted way
3. Ask explicitly: "Does this instruction capture what you want? Would you like me to refine anything?"
4. If user requests changes, use refineInstruction tool with their feedback
5. Continue refining until user gives explicit approval
6. Only proceed to summarizeForGeneration after clear approval

## QUALITY CHECKS BEFORE GENERATING INSTRUCTION:
Before using generateInstruction, ensure you have:
- Clear understanding of campaign goals and context
- Specific donor segments and their characteristics
- Tone and voice preferences
- Key messages and value propositions
- Any special considerations or constraints

## TONE:
Professional, insightful, and genuinely collaborative. You're a strategic partner who cares deeply about creating impactful donor communications. Show enthusiasm for discovering insights about donors and crafting personalized approaches. Be clear when presenting instructions and seeking approval.

## CRITICAL RESPONSE REQUIREMENT:
You MUST ALWAYS provide a text response in addition to any tool calls. When you call tools:
1. Call the necessary tools to gather information
2. THEN provide a conversational response discussing what you found
3. Include specific insights from the donor data
4. Ask intelligent follow-up questions
5. NEVER return an empty or blank response
6. Always engage the user in meaningful conversation about their donors

IMPORTANT: The system expects both tool calls AND a conversational text response. You must provide both.`;
}

/**
 * Build system prompt for Email Generation
 */
export function buildSystemPromptForEmailGeneration(params: {
  organizationName: string;
  organizationDescription: string | null;
  organizationWebsiteSummary: string | null;
  staffName: string;
  writingInstructions: string;
  userMemories: string[];
  organizationMemories: string[];
  currentDate: string;
}): string {
  const {
    organizationName,
    organizationDescription,
    organizationWebsiteSummary,
    staffName,
    writingInstructions,
    userMemories,
    organizationMemories,
    currentDate,
  } = params;

  return `You are an expert email writer specializing in wirting emails for ${organizationName}.

[ORGANIZATION CONTEXT]:
${organizationDescription ? `Organization Description: ${organizationDescription}` : ''}
${organizationWebsiteSummary ? `Organization Website Summary: ${organizationWebsiteSummary}` : ''}
${staffName ? `Email is being sent by: ${staffName}` : ''}
${writingInstructions ? `Writing Guidelines: ${writingInstructions}` : ''}

${userMemories.length > 0 ? `Personal Memories:\n${userMemories.join('\n')}\n` : ''}
${organizationMemories.length > 0 ? `Organization Memories:\n${organizationMemories.join('\n')}\n` : ''}

CURRENT DATE: ${currentDate}

TASK: Generate an email with the following structure, based on the user instruction and the donor context:
1. **subject**: A compelling subject line (50 characters max)
2. **reasoning**: Technical explanation of your email strategy and personalization tactics
3. **emailContent**: The complete email content as plain text, you should use line breaks as needed to make the email more readable.
4. **response**: User-facing summary describing what was delivered

REQUIREMENTS:
- Tone: Warm, personal, confident and conversational
- Use specific donation amounts and dates from the history when relevant andavailable
- Reference their impact using past donation history when relevant and available
- DO NOT include any signature, closing, or sign-off - this is added automatically
- Be specific and avoid general statements

Important instructions:
- DO NOT use dash, "-", "--" or "—" in the email ever.
- Try to be as specific as possible, avoid general statements.
- Pay extra attention to the numbers, you should make sure all numbers you mention are correct and accurate.

Priority order for conflicting instructions:
1. The user instruction takes the highest priority, if it conflicts with other instructions, the user instruction should always be followed.
2. The donor notes
3. Personal writing instructions
4. Organization writing instructions`;
}

/**
 * Build donor context for email generation
 */
export function buildDonorContext(params: DonorContextParams): string {
  const { donor, donorHistory } = params;

  let donorContext = `\n\nDONOR: ${formatDonorName(donor)} (${donor.email || 'no email'})`;

  if (donor.notes) {
    donorContext += `\nNotes about this Donor:\n${donor.notes.map((note) => `- ${note.content}`).join('\n')}`;
  }

  // Add donation history
  if (donorHistory.donations.length > 0) {
    donorContext += '\n\nDONATION HISTORY:';
    const sortedDonations = [...donorHistory.donations]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5); // Show last 5 donations

    sortedDonations.forEach((donation, index) => {
      const amount = (donation.amount / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      });
      const date = new Date(donation.date).toLocaleDateString();
      const project = donation.project ? ` to ${donation.project.name}` : '';
      donorContext += `\n${index + 1}. ${amount} on ${date}${project}`;
    });
  }

  // Add donor statistics
  if (donorHistory.statistics) {
    const stats = donorHistory.statistics;
    const totalAmount = (stats.totalAmount / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    donorContext += `\n\nDONOR STATISTICS:`;
    donorContext += `\nTotal donations: ${stats.totalDonations}`;
    donorContext += `\nTotal amount: ${totalAmount}`;

    if (stats.lastDonation) {
      const lastDate = new Date(stats.lastDonation.date).toLocaleDateString();
      donorContext += `\nLast donation: ${lastDate}`;
    }
  }

  // Add communication history
  if (donorHistory.communications.length > 0) {
    donorContext += '\n\nPAST COMMUNICATIONS:';
    donorHistory.communications.slice(0, 3).forEach((thread, index) => {
      if (thread.content && thread.content.length > 0) {
        donorContext += `\nCommunication ${index + 1}: ${thread.content[0].content.substring(0, 100)}...`;
      }
    });
  }

  // Add person research
  if (donorHistory.personResearch && donorHistory.personResearch.length > 0) {
    const research = donorHistory.personResearch[0];
    donorContext += '\n\nDONOR RESEARCH:';
    donorContext += `\n${research.answer}`;
    if (research.personIdentity) {
      if (research.personIdentity.profession) {
        donorContext += `\nProfession: ${research.personIdentity.profession}`;
      }
      if (research.personIdentity.location) {
        donorContext += `\nLocation: ${research.personIdentity.location}`;
      }
    }
  }

  return donorContext;
}
