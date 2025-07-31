import { db } from '@/app/lib/db';
import { organizationIntegrations } from '@/app/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import { crmManager } from './crm';
import type { CrmDonor, CrmDonation, CrmProject } from './crm/base/types';

/**
 * Service for real-time CRM synchronization
 * Handles syncing local data to CRM providers when records are created/updated
 */
export class CrmSyncService {
  private static instance: CrmSyncService;

  private constructor() {}

  static getInstance(): CrmSyncService {
    if (!CrmSyncService.instance) {
      CrmSyncService.instance = new CrmSyncService();
    }
    return CrmSyncService.instance;
  }

  /**
   * Get active CRM integration for an organization
   */
  private async getActiveIntegration(organizationId: string) {
    const integrations = await db.query.organizationIntegrations.findMany({
      where: and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.isActive, true)
      ),
    });

    // For now, return the first active integration
    // In the future, we might want to handle multiple integrations
    return integrations[0];
  }

  /**
   * Sync a donor to the CRM
   * Returns the external ID if successful, null otherwise
   */
  async syncDonor(
    organizationId: string,
    donor: {
      id?: number;
      externalId?: string;
      firstName: string;
      lastName: string;
      displayName?: string | null;
      email: string;
      phone?: string | null;
      address?: string | null;
      isCouple?: boolean | null;
      hisFirstName?: string | null;
      hisLastName?: string | null;
      herFirstName?: string | null;
      herLastName?: string | null;
    }
  ): Promise<string | null> {
    try {
      console.log(
        `[CrmSyncService.syncDonor] Starting sync: donorId=${donor.id}, externalId=${donor.externalId || 'none'}, email=${donor.email}`
      );

      const integration = await this.getActiveIntegration(organizationId);
      if (!integration) {
        console.log(
          `[CrmSyncService.syncDonor] No active CRM integration found for organization: ${organizationId}`
        );
        logger.debug('No active CRM integration found', { organizationId });
        return null;
      }

      console.log(
        `[CrmSyncService.syncDonor] Active integration found: provider=${integration.provider}`
      );
      const provider = crmManager.getProvider(integration.provider);

      // Check if provider supports uploading donors
      if (!provider.uploadDonors) {
        console.log(
          `[CrmSyncService.syncDonor] Provider does not support uploading donors: ${integration.provider}`
        );
        logger.debug('Provider does not support uploading donors', {
          provider: integration.provider,
        });
        return null;
      }

      // Extract the raw external ID if we have one (remove provider prefix)
      let rawExternalId = '';
      if (donor.externalId) {
        const prefix = `${integration.provider}_`;
        rawExternalId = donor.externalId.startsWith(prefix)
          ? donor.externalId.substring(prefix.length)
          : donor.externalId;
        console.log(`[CrmSyncService.syncDonor] Extracted raw external ID: ${rawExternalId}`);
      }

      // Convert to CRM donor format
      const crmDonor: CrmDonor = {
        externalId: rawExternalId, // Use existing external ID for updates
        firstName: donor.firstName,
        lastName: donor.lastName,
        displayName: donor.displayName || `${donor.firstName} ${donor.lastName}`,
        email: donor.email,
        phone: donor.phone || undefined,
        address: donor.address ? this.parseAddress(donor.address) : undefined,
        isCouple: donor.isCouple || false,
        hisFirstName: donor.hisFirstName || undefined,
        hisLastName: donor.hisLastName || undefined,
        herFirstName: donor.herFirstName || undefined,
        herLastName: donor.herLastName || undefined,
      };

      console.log(
        `[CrmSyncService.syncDonor] Uploading to CRM: isUpdate=${!!rawExternalId}, email=${crmDonor.email}`
      );

      // Upload to CRM
      const uploadedDonors = await provider.uploadDonors(
        integration.accessToken,
        [crmDonor],
        integration.metadata as Record<string, any>
      );

      if (uploadedDonors && uploadedDonors.length > 0) {
        const externalId = `${integration.provider}_${uploadedDonors[0].externalId}`;
        console.log(
          `[CrmSyncService.syncDonor] Successfully synced to CRM: externalId=${externalId}`
        );
        logger.info('Successfully synced donor to CRM', {
          organizationId,
          donorId: donor.id,
          externalId,
          provider: integration.provider,
          isUpdate: !!rawExternalId,
        });
        return externalId;
      }

      console.log(`[CrmSyncService.syncDonor] CRM upload returned no donors`);
      return null;
    } catch (error) {
      console.error(`[CrmSyncService.syncDonor] Failed to sync donor to CRM:`, error);
      logger.error('Failed to sync donor to CRM', {
        error,
        organizationId,
        donorId: donor.id,
      });
      return null;
    }
  }

  /**
   * Sync a project to the CRM
   * Returns the external ID if successful, null otherwise
   */
  async syncProject(
    organizationId: string,
    project: {
      id?: number;
      externalId?: string;
      name: string;
      description?: string | null;
      active: boolean;
      goal?: number | null;
      tags?: Record<string, any> | null;
    }
  ): Promise<string | null> {
    try {
      console.log(
        `[CrmSyncService.syncProject] Starting sync: projectId=${project.id}, externalId=${project.externalId || 'none'}, name=${project.name}`
      );

      const integration = await this.getActiveIntegration(organizationId);
      if (!integration) {
        console.log(
          `[CrmSyncService.syncProject] No active CRM integration found for organization: ${organizationId}`
        );
        logger.debug('No active CRM integration found', { organizationId });
        return null;
      }

      console.log(
        `[CrmSyncService.syncProject] Active integration found: provider=${integration.provider}`
      );
      const provider = crmManager.getProvider(integration.provider);

      // Check if provider supports uploading projects
      if (!provider.uploadProjects) {
        console.log(
          `[CrmSyncService.syncProject] Provider does not support uploading projects: ${integration.provider}`
        );
        logger.debug('Provider does not support uploading projects', {
          provider: integration.provider,
        });
        return null;
      }

      // Extract the raw external ID if we have one (remove provider prefix)
      let rawExternalId = '';
      if (project.externalId) {
        const prefix = `${integration.provider}_`;
        rawExternalId = project.externalId.startsWith(prefix)
          ? project.externalId.substring(prefix.length)
          : project.externalId;
        console.log(`[CrmSyncService.syncProject] Extracted raw external ID: ${rawExternalId}`);
      }

      // Convert to CRM project format
      const crmProject: CrmProject = {
        externalId: rawExternalId, // Use existing external ID for updates
        name: project.name,
        description: project.description || undefined,
        active: project.active,
        goal: project.goal || undefined,
        tags: Array.isArray(project.tags) ? project.tags : undefined,
      };

      console.log(
        `[CrmSyncService.syncProject] Uploading to CRM: isUpdate=${!!rawExternalId}, name=${crmProject.name}`
      );

      // Upload to CRM
      const uploadedProjects = await provider.uploadProjects(
        integration.accessToken,
        [crmProject],
        integration.metadata as Record<string, any>
      );

      if (uploadedProjects && uploadedProjects.length > 0) {
        const externalId = `${integration.provider}_${uploadedProjects[0].externalId}`;
        console.log(
          `[CrmSyncService.syncProject] Successfully synced to CRM: externalId=${externalId}`
        );
        logger.info('Successfully synced project to CRM', {
          organizationId,
          projectId: project.id,
          externalId,
          provider: integration.provider,
          isUpdate: !!rawExternalId,
        });
        return externalId;
      }

      console.log(`[CrmSyncService.syncProject] CRM upload returned no projects`);
      return null;
    } catch (error) {
      console.error(`[CrmSyncService.syncProject] Failed to sync project to CRM:`, error);
      logger.error('Failed to sync project to CRM', {
        error,
        organizationId,
        projectId: project.id,
      });
      return null;
    }
  }

  /**
   * Sync a donation to the CRM
   * Returns the external ID if successful, null otherwise
   */
  async syncDonation(
    organizationId: string,
    donation: {
      id?: number;
      externalId?: string;
      donorExternalId: string;
      projectExternalId?: string | null;
      amount: number;
      currency: string;
      date: Date;
    }
  ): Promise<string | null> {
    try {
      console.log(
        `[CrmSyncService.syncDonation] Starting sync: donationId=${donation.id}, externalId=${donation.externalId || 'none'}, amount=${donation.amount}`
      );

      const integration = await this.getActiveIntegration(organizationId);
      if (!integration) {
        console.log(
          `[CrmSyncService.syncDonation] No active CRM integration found for organization: ${organizationId}`
        );
        logger.debug('No active CRM integration found', { organizationId });
        return null;
      }

      console.log(
        `[CrmSyncService.syncDonation] Active integration found: provider=${integration.provider}`
      );
      const provider = crmManager.getProvider(integration.provider);

      // Check if provider supports uploading donations
      if (!provider.uploadDonations) {
        console.log(
          `[CrmSyncService.syncDonation] Provider does not support uploading donations: ${integration.provider}`
        );
        logger.debug('Provider does not support uploading donations', {
          provider: integration.provider,
        });
        return null;
      }

      // Extract the raw external ID if we have one (remove provider prefix)
      let rawExternalId = '';
      if (donation.externalId) {
        const prefix = `${integration.provider}_`;
        rawExternalId = donation.externalId.startsWith(prefix)
          ? donation.externalId.substring(prefix.length)
          : donation.externalId;
        console.log(`[CrmSyncService.syncDonation] Extracted raw external ID: ${rawExternalId}`);
      }

      // Extract provider-specific external IDs
      const donorExternalId = donation.donorExternalId.replace(`${integration.provider}_`, '');
      const projectExternalId = donation.projectExternalId
        ? donation.projectExternalId.replace(`${integration.provider}_`, '')
        : undefined;

      // Convert to CRM donation format
      const crmDonation: CrmDonation = {
        externalId: rawExternalId, // Use existing external ID for updates
        donorExternalId,
        amount: donation.amount,
        currency: donation.currency,
        date: donation.date,
        campaignExternalId: projectExternalId,
      };

      console.log(
        `[CrmSyncService.syncDonation] Uploading to CRM: isUpdate=${!!rawExternalId}, donorExternalId=${donorExternalId}, amount=${crmDonation.amount}`
      );

      // Upload to CRM
      const uploadedDonations = await provider.uploadDonations(
        integration.accessToken,
        [crmDonation],
        integration.metadata as Record<string, any>
      );

      if (uploadedDonations && uploadedDonations.length > 0) {
        const externalId = `${integration.provider}_${uploadedDonations[0].externalId}`;
        console.log(
          `[CrmSyncService.syncDonation] Successfully synced to CRM: externalId=${externalId}`
        );
        logger.info('Successfully synced donation to CRM', {
          organizationId,
          donationId: donation.id,
          externalId,
          provider: integration.provider,
          isUpdate: !!rawExternalId,
        });
        return externalId;
      }

      console.log(`[CrmSyncService.syncDonation] CRM upload returned no donations`);
      return null;
    } catch (error) {
      console.error(`[CrmSyncService.syncDonation] Failed to sync donation to CRM:`, error);
      logger.error('Failed to sync donation to CRM', {
        error,
        organizationId,
        donationId: donation.id,
      });
      return null;
    }
  }

  /**
   * Parse address string back to components
   */
  private parseAddress(addressString: string): CrmDonor['address'] {
    const parts = addressString.split(', ');
    return {
      street: parts[0] || undefined,
      city: parts[1] || undefined,
      state: parts[2] || undefined,
      postalCode: parts[3] || undefined,
      country: parts[4] || undefined,
    };
  }
}

// Export singleton instance
export const crmSyncService = CrmSyncService.getInstance();
