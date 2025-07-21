import { db } from '@/app/lib/db';
import { donors, donations, projects, organizationIntegrations } from '@/app/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import { CrmDonor, CrmDonation, CrmSyncResult } from './types';
import { ICrmProvider } from './crm-provider.interface';

/**
 * Base sync service that handles common sync logic for all CRM providers
 */
export class CrmSyncService {
  constructor(private provider: ICrmProvider) {}

  /**
   * Sync all data from the CRM for an organization
   */
  async syncOrganizationData(
    organizationId: string,
    integration: typeof organizationIntegrations.$inferSelect
  ): Promise<CrmSyncResult> {
    const startTime = Date.now();
    const result: CrmSyncResult = {
      donors: { created: 0, updated: 0, failed: 0, errors: [] },
      donations: { created: 0, updated: 0, failed: 0, errors: [] },
      totalTime: 0,
    };

    try {
      // Update sync status to 'syncing'
      await db
        .update(organizationIntegrations)
        .set({
          syncStatus: 'syncing',
          syncError: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationIntegrations.id, integration.id));

      // Sync donors first
      logger.info(`Starting donor sync for organization ${organizationId}`);
      const donorResult = await this.syncDonors(
        organizationId,
        integration.accessToken,
        integration.metadata as Record<string, any>
      );
      result.donors = donorResult;

      // Then sync donations
      logger.info(`Starting donation sync for organization ${organizationId}`);
      const donationResult = await this.syncDonations(
        organizationId,
        integration.accessToken,
        integration.metadata as Record<string, any>
      );
      result.donations = donationResult;

      // Update sync status to 'idle' and last sync time
      await db
        .update(organizationIntegrations)
        .set({
          syncStatus: 'idle',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizationIntegrations.id, integration.id));
    } catch (error) {
      logger.error('CRM sync failed', { error, organizationId, provider: this.provider.name });

      // Update sync status to 'error'
      await db
        .update(organizationIntegrations)
        .set({
          syncStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(organizationIntegrations.id, integration.id));

      throw error;
    }

    result.totalTime = Date.now() - startTime;
    return result;
  }

  /**
   * Sync donors from CRM
   */
  private async syncDonors(
    organizationId: string,
    accessToken: string,
    metadata: Record<string, any>
  ): Promise<CrmSyncResult['donors']> {
    const result = { created: 0, updated: 0, failed: 0, errors: [] as any[] };
    let hasMore = true;
    let pageToken: string | undefined;

    while (hasMore) {
      try {
        const response = await this.provider.fetchDonors(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        for (const crmDonor of response.data) {
          try {
            await this.upsertDonor(organizationId, crmDonor);
            result.updated++; // We'll count both creates and updates as updates
          } catch (error) {
            result.failed++;
            result.errors.push({
              externalId: crmDonor.externalId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            logger.error('Failed to sync donor', { error, externalId: crmDonor.externalId });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error('Failed to fetch donors page', { error, pageToken });
        throw error;
      }
    }

    return result;
  }

  /**
   * Sync donations from CRM
   */
  private async syncDonations(
    organizationId: string,
    accessToken: string,
    metadata: Record<string, any>
  ): Promise<CrmSyncResult['donations']> {
    const result = { created: 0, updated: 0, failed: 0, errors: [] as any[] };
    let hasMore = true;
    let pageToken: string | undefined;

    // Get or create default project for external donations
    const defaultProject = await this.getOrCreateDefaultProject(organizationId);

    while (hasMore) {
      try {
        const response = await this.provider.fetchDonations(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        for (const crmDonation of response.data) {
          try {
            await this.upsertDonation(organizationId, crmDonation, defaultProject.id);
            result.updated++;
          } catch (error) {
            result.failed++;
            result.errors.push({
              externalId: crmDonation.externalId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            logger.error('Failed to sync donation', { error, externalId: crmDonation.externalId });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error('Failed to fetch donations page', { error, pageToken });
        throw error;
      }
    }

    return result;
  }

  /**
   * Upsert a donor record
   */
  private async upsertDonor(organizationId: string, crmDonor: CrmDonor): Promise<void> {
    const externalId = `${this.provider.name}_${crmDonor.externalId}`;

    // Check if donor exists
    const existingDonor = await db.query.donors.findFirst({
      where: and(eq(donors.organizationId, organizationId), eq(donors.externalId, externalId)),
    });

    const donorData = {
      organizationId,
      externalId,
      firstName: crmDonor.firstName,
      lastName: crmDonor.lastName,
      displayName: crmDonor.displayName || `${crmDonor.firstName} ${crmDonor.lastName}`,
      email: crmDonor.email,
      phone: crmDonor.phone,
      address: this.formatAddress(crmDonor.address),
      isCouple: crmDonor.isCouple || false,
      hisFirstName: crmDonor.hisFirstName,
      hisLastName: crmDonor.hisLastName,
      herFirstName: crmDonor.herFirstName,
      herLastName: crmDonor.herLastName,
      updatedAt: new Date(),
    };

    if (existingDonor) {
      await db.update(donors).set(donorData).where(eq(donors.id, existingDonor.id));
    } else {
      await db.insert(donors).values(donorData);
    }
  }

  /**
   * Upsert a donation record
   */
  private async upsertDonation(
    organizationId: string,
    crmDonation: CrmDonation,
    defaultProjectId: number
  ): Promise<void> {
    const donorExternalId = `${this.provider.name}_${crmDonation.donorExternalId}`;
    const donationExternalId = `${this.provider.name}_${crmDonation.externalId}`;

    // Find the donor
    const donor = await db.query.donors.findFirst({
      where: and(eq(donors.organizationId, organizationId), eq(donors.externalId, donorExternalId)),
    });

    if (!donor) {
      throw new Error(`Donor not found for external ID: ${donorExternalId}`);
    }

    // Check if donation exists
    const existingDonation = await db.query.donations.findFirst({
      where: eq(donations.externalId, donationExternalId),
    });

    const donationData = {
      donorId: donor.id,
      projectId: defaultProjectId, // TODO: Map designation to projects
      externalId: donationExternalId,
      amount: crmDonation.amount,
      currency: crmDonation.currency,
      date: crmDonation.date,
      updatedAt: new Date(),
    };

    if (existingDonation) {
      await db.update(donations).set(donationData).where(eq(donations.id, existingDonation.id));
    } else {
      await db.insert(donations).values(donationData);
    }
  }

  /**
   * Get or create a default project for external donations
   */
  private async getOrCreateDefaultProject(
    organizationId: string
  ): Promise<typeof projects.$inferSelect> {
    const existingProject = await db.query.projects.findFirst({
      where: and(eq(projects.organizationId, organizationId), eq(projects.external, true)),
    });

    if (existingProject) {
      return existingProject;
    }

    const [newProject] = await db
      .insert(projects)
      .values({
        organizationId,
        name: 'External Donations',
        description: `Donations synced from ${this.provider.displayName}`,
        external: true,
        active: true,
      })
      .returning();

    return newProject;
  }

  /**
   * Format address for storage
   */
  private formatAddress(address?: CrmDonor['address']): string | undefined {
    if (!address) return undefined;

    const parts = [
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : undefined;
  }
}
