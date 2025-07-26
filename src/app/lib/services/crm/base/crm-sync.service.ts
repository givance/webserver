import { db } from '@/app/lib/db';
import { donors, donations, projects, organizationIntegrations } from '@/app/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import { CrmDonor, CrmDonation, CrmSyncResult, PaginationParams, PaginatedResponse } from './types';
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
    integration: typeof organizationIntegrations.$inferSelect,
    usePerDonorGiftTransactions = false
  ): Promise<CrmSyncResult> {
    const startTime = Date.now();
    const result: CrmSyncResult = {
      donors: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] },
      donations: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] },
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

      if (usePerDonorGiftTransactions && this.provider.name === 'salesforce') {
        // Use the new approach: fetch donors with their gift transactions
        logger.info(
          `Starting combined donor and gift transaction sync for organization ${organizationId}`,
          {
            organizationId,
            provider: this.provider.name,
            integrationId: integration.id,
            approach: 'per-donor-gift-transactions',
          }
        );

        const syncResult = await this.syncDonorsWithGiftTransactions(
          organizationId,
          integration.accessToken,
          integration.metadata as Record<string, any>
        );
        result.donors = syncResult.donors;
        result.donations = syncResult.donations;
      } else {
        // Use the original approach: sync donors and donations separately
        // Sync donors first
        logger.info(`Starting donor sync for organization ${organizationId}`, {
          organizationId,
          provider: this.provider.name,
          integrationId: integration.id,
          approach: 'traditional',
        });
        const donorResult = await this.syncDonors(
          organizationId,
          integration.accessToken,
          integration.metadata as Record<string, any>
        );
        result.donors = donorResult;

        // Then sync donations
        logger.info(`Starting donation sync for organization ${organizationId}`, {
          organizationId,
          provider: this.provider.name,
          integrationId: integration.id,
        });
        const donationResult = await this.syncDonations(
          organizationId,
          integration.accessToken,
          integration.metadata as Record<string, any>
        );
        result.donations = donationResult;
      }

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
    const result = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      errors: [] as any[],
      createdDonors: [] as Array<{ externalId: string; displayName: string }>,
      updatedDonors: [] as Array<{ externalId: string; displayName: string }>,
      unchangedDonors: [] as Array<{ externalId: string; displayName: string }>,
    };
    let hasMore = true;
    let pageToken: string | undefined;
    let pageNumber = 0;

    while (hasMore) {
      try {
        const response = await this.provider.fetchDonors(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        pageNumber++;
        logger.info(`Fetched donors page ${pageNumber} from ${this.provider.name}`, {
          organizationId,
          provider: this.provider.name,
          pageNumber,
          donorsInPage: response.data.length,
          hasMore: response.hasMore,
          totalCount: response.totalCount,
        });

        // Log sample of fetched donors for debugging
        if (response.data.length > 0) {
          logger.info(`Sample donors from ${this.provider.name} page ${pageNumber}`, {
            organizationId,
            provider: this.provider.name,
            pageNumber,
            sampleDonors: response.data.slice(0, 3).map((donor) => ({
              externalId: donor.externalId,
              firstName: donor.firstName,
              lastName: donor.lastName,
              email: donor.email,
              phone: donor.phone,
              isCouple: donor.isCouple,
              displayName: donor.displayName,
            })),
            totalDonorsInPage: response.data.length,
          });
        }

        // Log ALL raw donor data to console
        console.log('\n========== RAW SALESFORCE DONORS DATA ==========');
        console.log(`Page ${pageNumber} - Total donors: ${response.data.length}`);
        response.data.forEach((donor, index) => {
          console.log(`\nDonor ${index + 1}:`);
          console.log(JSON.stringify(donor, null, 2));
        });
        console.log('========== END OF DONORS DATA ==========\n');

        // Track total donors processed
        result.total += response.data.length;

        for (const crmDonor of response.data) {
          try {
            const operation = await this.upsertDonor(organizationId, crmDonor);
            const donorInfo = {
              externalId: crmDonor.externalId,
              displayName: crmDonor.displayName || `${crmDonor.firstName} ${crmDonor.lastName}`,
            };

            if (operation === 'created') {
              result.created++;
              // Track first 100 created donors
              if (result.createdDonors.length < 100) {
                result.createdDonors.push(donorInfo);
              }
            } else if (operation === 'updated') {
              result.updated++;
              // Track first 100 updated donors
              if (result.updatedDonors.length < 100) {
                result.updatedDonors.push(donorInfo);
              }
            } else if (operation === 'unchanged') {
              result.unchanged++;
              // Track first 100 unchanged donors
              if (result.unchangedDonors.length < 100) {
                result.unchangedDonors.push(donorInfo);
              }
            }
          } catch (error) {
            result.failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push({
              externalId: crmDonor.externalId,
              error: errorMessage,
            });
            logger.error('Failed to sync donor', {
              error: errorMessage,
              externalId: crmDonor.externalId,
            });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error('Failed to fetch donors page', { error, pageToken });
        throw error;
      }
    }

    logger.info(`Completed donor sync from ${this.provider.name}`, {
      organizationId,
      provider: this.provider.name,
      totalPages: pageNumber,
      result,
    });

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
    const result = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      errors: [] as any[],
      createdDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
      updatedDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
      unchangedDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
    };
    let hasMore = true;
    let pageToken: string | undefined;
    let pageNumber = 0;

    // Get or create default project for external donations
    const defaultProject = await this.getOrCreateDefaultProject(organizationId);

    while (hasMore) {
      try {
        const response = await this.provider.fetchDonations(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        pageNumber++;
        logger.info(`Fetched donations page ${pageNumber} from ${this.provider.name}`, {
          organizationId,
          provider: this.provider.name,
          pageNumber,
          donationsInPage: response.data.length,
          hasMore: response.hasMore,
          totalCount: response.totalCount,
        });

        // Log sample of fetched donations for debugging
        if (response.data.length > 0) {
          logger.info(`Sample donations from ${this.provider.name} page ${pageNumber}`, {
            organizationId,
            provider: this.provider.name,
            pageNumber,
            sampleDonations: response.data.slice(0, 3).map((donation) => ({
              externalId: donation.externalId,
              donorExternalId: donation.donorExternalId,
              amount: donation.amount,
              currency: donation.currency,
              date: donation.date,
              designation: donation.designation,
            })),
            totalDonationsInPage: response.data.length,
          });
        }

        // Log ALL raw donation data to console
        console.log('\n========== RAW SALESFORCE DONATIONS DATA ==========');
        console.log(`Page ${pageNumber} - Total donations: ${response.data.length}`);
        response.data.forEach((donation, index) => {
          console.log(`\nDonation ${index + 1}:`);
          console.log(JSON.stringify(donation, null, 2));
        });
        console.log('========== END OF DONATIONS DATA ==========\n');

        // Track total donations processed
        result.total += response.data.length;

        for (const crmDonation of response.data) {
          try {
            const operation = await this.upsertDonation(
              organizationId,
              crmDonation,
              defaultProject.id
            );
            const donationInfo = {
              externalId: crmDonation.externalId,
              amount: crmDonation.amount,
              date: crmDonation.date,
            };

            if (operation === 'created') {
              result.created++;
              // Track first 100 created donations
              if (result.createdDonations.length < 100) {
                result.createdDonations.push(donationInfo);
              }
            } else if (operation === 'updated') {
              result.updated++;
              // Track first 100 updated donations
              if (result.updatedDonations.length < 100) {
                result.updatedDonations.push(donationInfo);
              }
            } else if (operation === 'unchanged') {
              result.unchanged++;
              // Track first 100 unchanged donations
              if (result.unchangedDonations.length < 100) {
                result.unchangedDonations.push(donationInfo);
              }
            }
          } catch (error) {
            result.failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push({
              externalId: crmDonation.externalId,
              error: errorMessage,
            });
            logger.error('Failed to sync donation', {
              error: errorMessage,
              externalId: crmDonation.externalId,
              donorExternalId: crmDonation.donorExternalId,
            });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error('Failed to fetch donations page', { error, pageToken });
        throw error;
      }
    }

    // Extract unique missing donor IDs from errors
    const missingDonorErrors = result.errors.filter((e) => e.error.includes('Donor not found'));
    const uniqueMissingDonors = [
      ...new Set(
        missingDonorErrors
          .map((e) => {
            const match = e.error.match(/Donor not found for external ID: ([^ ]+)/);
            return match ? match[1] : null;
          })
          .filter(Boolean)
      ),
    ];

    if (uniqueMissingDonors.length > 0) {
      logger.warn(
        `Donation sync completed with ${uniqueMissingDonors.length} missing donor references`,
        {
          organizationId,
          provider: this.provider.name,
          missingDonors: uniqueMissingDonors.slice(0, 10), // Log first 10
          totalMissingDonors: uniqueMissingDonors.length,
        }
      );
    }

    logger.info(`Completed donation sync from ${this.provider.name}`, {
      organizationId,
      provider: this.provider.name,
      totalPages: pageNumber,
      result,
    });

    return result;
  }

  /**
   * Upsert a donor record
   * Returns 'created', 'updated', or 'unchanged'
   */
  private async upsertDonor(
    organizationId: string,
    crmDonor: CrmDonor
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const externalId = `${this.provider.name}_${crmDonor.externalId}`;

    // Log field lengths for debugging
    logger.debug('Donor field lengths', {
      externalId: externalId.length,
      firstName: crmDonor.firstName?.length,
      lastName: crmDonor.lastName?.length,
      displayName: crmDonor.displayName?.length,
      email: crmDonor.email?.length,
      phone: crmDonor.phone?.length,
      addressParts: crmDonor.address,
    });

    // Check if donor exists
    const existingDonor = await db.query.donors.findFirst({
      where: and(eq(donors.organizationId, organizationId), eq(donors.externalId, externalId)),
    });

    // Truncate fields to match database constraints
    const donorData = {
      organizationId,
      externalId: externalId.substring(0, 255),
      firstName: crmDonor.firstName.substring(0, 255),
      lastName: crmDonor.lastName.substring(0, 255),
      displayName: (crmDonor.displayName || `${crmDonor.firstName} ${crmDonor.lastName}`).substring(
        0,
        500
      ),
      email: crmDonor.email.substring(0, 255),
      phone: crmDonor.phone?.substring(0, 20),
      address: this.formatAddress(crmDonor.address),
      isCouple: crmDonor.isCouple || false,
      hisFirstName: crmDonor.hisFirstName?.substring(0, 255),
      hisLastName: crmDonor.hisLastName?.substring(0, 255),
      herFirstName: crmDonor.herFirstName?.substring(0, 255),
      herLastName: crmDonor.herLastName?.substring(0, 255),
      updatedAt: new Date(),
    };

    if (existingDonor) {
      // Check if any data has changed
      const hasChanges =
        existingDonor.firstName !== donorData.firstName ||
        existingDonor.lastName !== donorData.lastName ||
        existingDonor.displayName !== donorData.displayName ||
        existingDonor.email !== donorData.email ||
        existingDonor.phone !== donorData.phone ||
        existingDonor.address !== donorData.address ||
        existingDonor.isCouple !== donorData.isCouple ||
        existingDonor.hisFirstName !== donorData.hisFirstName ||
        existingDonor.hisLastName !== donorData.hisLastName ||
        existingDonor.herFirstName !== donorData.herFirstName ||
        existingDonor.herLastName !== donorData.herLastName;

      if (hasChanges) {
        await db.update(donors).set(donorData).where(eq(donors.id, existingDonor.id));
        return 'updated';
      } else {
        return 'unchanged';
      }
    } else {
      await db.insert(donors).values(donorData);
      return 'created';
    }
  }

  /**
   * Upsert a donation record
   * Returns 'created', 'updated', or 'unchanged'
   */
  private async upsertDonation(
    organizationId: string,
    crmDonation: CrmDonation,
    defaultProjectId: number
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const donorExternalId = `${this.provider.name}_${crmDonation.donorExternalId}`;
    const donationExternalId = `${this.provider.name}_${crmDonation.externalId}`;

    // Find the donor
    const donor = await db.query.donors.findFirst({
      where: and(eq(donors.organizationId, organizationId), eq(donors.externalId, donorExternalId)),
    });

    if (!donor) {
      // Log the missing donor reference but don't throw - this allows the sync to continue
      logger.warn(
        `Donation ${crmDonation.externalId} references non-existent donor ${donorExternalId}`,
        {
          donationExternalId: crmDonation.externalId,
          donorExternalId: donorExternalId,
          organizationId,
        }
      );
      throw new Error(
        `Donor not found for external ID: ${crmDonation.donorExternalId} (full ID: ${donorExternalId})`
      );
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
      // Check if any data has changed
      const hasChanges =
        existingDonation.donorId !== donationData.donorId ||
        existingDonation.projectId !== donationData.projectId ||
        existingDonation.amount !== donationData.amount ||
        existingDonation.currency !== donationData.currency ||
        existingDonation.date.getTime() !== donationData.date.getTime();

      if (hasChanges) {
        await db.update(donations).set(donationData).where(eq(donations.id, existingDonation.id));
        return 'updated';
      } else {
        return 'unchanged';
      }
    } else {
      await db.insert(donations).values(donationData);
      return 'created';
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

  /**
   * Sync donors with their gift transactions in a single pass
   * This approach fetches donors and their donations together
   */
  private async syncDonorsWithGiftTransactions(
    organizationId: string,
    accessToken: string,
    metadata: Record<string, any>
  ): Promise<{ donors: CrmSyncResult['donors']; donations: CrmSyncResult['donations'] }> {
    const donorResult = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      errors: [] as any[],
      createdDonors: [] as Array<{ externalId: string; displayName: string }>,
      updatedDonors: [] as Array<{ externalId: string; displayName: string }>,
      unchangedDonors: [] as Array<{ externalId: string; displayName: string }>,
    };

    const donationResult = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      errors: [] as any[],
      createdDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
      updatedDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
      unchangedDonations: [] as Array<{ externalId: string; amount: number; date: Date }>,
    };

    // Get or create default project for donations
    const defaultProject = await this.getOrCreateDefaultProject(organizationId);

    let hasMore = true;
    let pageToken: string | undefined;
    let pageNumber = 0;

    // Type guard to check if provider has the new method
    const providerWithGiftTransactions = this.provider as ICrmProvider & {
      fetchDonorsWithGiftTransactions: (
        accessToken: string,
        params: PaginationParams,
        metadata?: Record<string, any>
      ) => Promise<PaginatedResponse<CrmDonor & { donations?: CrmDonation[] }>>;
    };
    if (!('fetchDonorsWithGiftTransactions' in this.provider)) {
      throw new Error(
        `Provider ${this.provider.name} does not support fetchDonorsWithGiftTransactions`
      );
    }

    while (hasMore) {
      try {
        const response = await providerWithGiftTransactions.fetchDonorsWithGiftTransactions(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        pageNumber++;
        logger.info(`Fetched donors with gift transactions page ${pageNumber}`, {
          organizationId,
          provider: this.provider.name,
          pageNumber,
          donorsInPage: response.data.length,
          hasMore: response.hasMore,
        });

        donorResult.total += response.data.length;

        // Process each donor and their donations
        for (const donorWithDonations of response.data) {
          const { donations, ...crmDonor } = donorWithDonations;

          // First, upsert the donor
          try {
            const operation = await this.upsertDonor(organizationId, crmDonor);
            const donorInfo = {
              externalId: crmDonor.externalId,
              displayName: crmDonor.displayName || `${crmDonor.firstName} ${crmDonor.lastName}`,
            };

            if (operation === 'created') {
              donorResult.created++;
              if (donorResult.createdDonors.length < 100) {
                donorResult.createdDonors.push(donorInfo);
              }
            } else if (operation === 'updated') {
              donorResult.updated++;
              if (donorResult.updatedDonors.length < 100) {
                donorResult.updatedDonors.push(donorInfo);
              }
            } else if (operation === 'unchanged') {
              donorResult.unchanged++;
              if (donorResult.unchangedDonors.length < 100) {
                donorResult.unchangedDonors.push(donorInfo);
              }
            }

            // Then, process their donations if any
            if (donations && donations.length > 0) {
              donationResult.total += donations.length;

              logger.info(`Processing ${donations.length} gift transactions for donor`, {
                donorExternalId: crmDonor.externalId,
                donorName: donorInfo.displayName,
                totalAmount: donations.reduce((sum, d) => sum + d.amount, 0),
              });

              for (const donation of donations) {
                try {
                  // Ensure the donation references the correct donor
                  const donationWithCorrectDonor = {
                    ...donation,
                    donorExternalId: crmDonor.externalId,
                  };

                  const donationOperation = await this.upsertDonation(
                    organizationId,
                    donationWithCorrectDonor,
                    defaultProject.id
                  );

                  const donationInfo = {
                    externalId: donation.externalId,
                    amount: donation.amount,
                    date: donation.date,
                  };

                  if (donationOperation === 'created') {
                    donationResult.created++;
                    if (donationResult.createdDonations.length < 100) {
                      donationResult.createdDonations.push(donationInfo);
                    }
                  } else if (donationOperation === 'updated') {
                    donationResult.updated++;
                    if (donationResult.updatedDonations.length < 100) {
                      donationResult.updatedDonations.push(donationInfo);
                    }
                  } else if (donationOperation === 'unchanged') {
                    donationResult.unchanged++;
                    if (donationResult.unchangedDonations.length < 100) {
                      donationResult.unchangedDonations.push(donationInfo);
                    }
                  }
                } catch (error) {
                  donationResult.failed++;
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  donationResult.errors.push({
                    externalId: donation.externalId,
                    error: errorMessage,
                  });
                  logger.error('Failed to sync donation', {
                    error: errorMessage,
                    donationExternalId: donation.externalId,
                    donorExternalId: crmDonor.externalId,
                  });
                }
              }
            }
          } catch (error) {
            donorResult.failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            donorResult.errors.push({
              externalId: crmDonor.externalId,
              error: errorMessage,
            });
            logger.error('Failed to sync donor', {
              error: errorMessage,
              externalId: crmDonor.externalId,
              firstName: crmDonor.firstName,
              lastName: crmDonor.lastName,
            });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error('Failed to fetch donors with gift transactions page', { error, pageToken });
        throw error;
      }
    }

    logger.info('Completed sync with gift transactions approach', {
      organizationId,
      provider: this.provider.name,
      totalPages: pageNumber,
      donorResult,
      donationResult,
    });

    return {
      donors: donorResult,
      donations: donationResult,
    };
  }
}
