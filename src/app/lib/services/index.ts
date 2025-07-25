import { OrganizationsService } from './organizations.service';
import { AgenticEmailGenerationService } from './agentic-email-generation.service';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailSchedulingService } from './email-scheduling.service';
import { CommunicationsService } from './communications.service';
import { TodoService } from './todo-service';
import { GmailService } from './gmail.service';
import { PersonResearchService } from './person-research.service';
import { BulkDonorResearchService } from './bulk-donor-research.service';
import { DonorJourneyService } from './donor-journey.service';
import { WhatsAppPermissionService } from './whatsapp/whatsapp-permission.service';
import { WhatsAppStaffLoggingService } from './whatsapp/whatsapp-staff-logging.service';
import { WhatsAppHistoryService } from './whatsapp/whatsapp-history.service';
import { WhatsAppAIService } from './whatsapp/whatsapp-ai.service';
import { DonorAnalysisService } from './donor-analysis.service';
import { DonorsService } from './donors.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { StaffGmailService } from './staff-gmail.service';
import { UnifiedSmartEmailGenerationService } from './unified-smart-email-generation.service';
import { EmailReviewService } from './email-review.service';

// Import analysis services
import { StageClassificationService } from '@/app/lib/analysis/stage-classification-service';
import { StageTransitionService } from '@/app/lib/analysis/stage-transition-service';
import { ActionPredictionService } from '@/app/lib/analysis/action-prediction-service';

/**
 * Creates and returns all service instances
 * This function is called once during context creation
 * to provide dependency injection for tRPC routers
 */
export const createServices = () => {
  return {
    // Core services
    organizations: new OrganizationsService(),
    communications: new CommunicationsService(),
    todos: new TodoService(),
    donorJourney: new DonorJourneyService(),
    donors: new DonorsService(),

    // Email services
    agenticEmailGeneration: new AgenticEmailGenerationService(),
    emailCampaigns: new EmailCampaignsService(),
    emailScheduling: new EmailSchedulingService(),
    unifiedSmartEmailGeneration: new UnifiedSmartEmailGenerationService(),
    emailReview: new EmailReviewService(),

    // Integration services
    gmail: new GmailService(),
    microsoftOAuth: new MicrosoftOAuthService(),
    staffGmail: new StaffGmailService(),

    // Research services
    personResearch: new PersonResearchService(),
    bulkDonorResearch: new BulkDonorResearchService(),

    // Analysis services
    stageClassification: new StageClassificationService(),
    stageTransition: new StageTransitionService(),
    actionPrediction: new ActionPredictionService(),
    donorAnalysis: new DonorAnalysisService(),

    // WhatsApp services
    whatsappPermission: new WhatsAppPermissionService(),
    whatsappStaffLogging: new WhatsAppStaffLoggingService(),
    whatsappHistory: new WhatsAppHistoryService(),
    whatsappAI: new WhatsAppAIService(),
  };
};

/**
 * Type representing all available services
 * This is used to type the services in the tRPC context
 */
export type Services = ReturnType<typeof createServices>;

/**
 * Export individual service classes for direct use in tests
 * or other scenarios where dependency injection is not needed
 */
export { OrganizationsService } from './organizations.service';
export { AgenticEmailGenerationService } from './agentic-email-generation.service';
export { EmailCampaignsService } from './email-campaigns.service';
export { EmailSchedulingService } from './email-scheduling.service';
export { CommunicationsService } from './communications.service';
export { TodoService } from './todo-service';
export { GmailService } from './gmail.service';
export { PersonResearchService } from './person-research.service';
export { BulkDonorResearchService } from './bulk-donor-research.service';
export { DonorJourneyService } from './donor-journey.service';
export { DonorAnalysisService } from './donor-analysis.service';
export { DonorsService } from './donors.service';
export { MicrosoftOAuthService } from './microsoft-oauth.service';
export { StaffGmailService } from './staff-gmail.service';
export { UnifiedSmartEmailGenerationService } from './unified-smart-email-generation.service';
export { EmailReviewService } from './email-review.service';
