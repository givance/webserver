import { db } from '@/app/lib/db';
import { donors, donations, projects, staffIntegrations } from '@/app/lib/db/schema';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import { logger } from '@/app/lib/logger';
import {
  CrmDonor,
  CrmDonation,
  CrmProject,
  CrmSyncResult,
  PaginationParams,
  PaginatedResponse,
} from './types';
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
    integration: typeof staffIntegrations.$inferSelect,
    usePerDonorGiftTransactions = false
  ): Promise<CrmSyncResult> {
    const startTime = Date.now();
    const result: CrmSyncResult = {
      donors: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] },
      donations: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] },
      projects: { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] },
      totalTime: 0,
    };

    try {
      // Update sync status to 'syncing'
      await db
        .update(staffIntegrations)
        .set({
          syncStatus: 'syncing',
          syncError: null,
          updatedAt: new Date(),
        })
        .where(eq(staffIntegrations.id, integration.id));

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

        // Sync projects FIRST (before combined donor/donation sync)
        if (this.provider.fetchProjects) {
          logger.info(`Starting project sync for organization ${organizationId}`, {
            organizationId,
            provider: this.provider.name,
            integrationId: integration.id,
          });
          const projectResult = await this.syncProjects(
            organizationId,
            integration.accessToken,
            integration.metadata as Record<string, any>
          );
          result.projects = projectResult;
        }

        const syncResult = await this.syncDonorsWithGiftTransactions(
          organizationId,
          integration.accessToken,
          integration.metadata as Record<string, any>
        );
        result.donors = syncResult.donors;
        result.donations = syncResult.donations;
      } else {
        // Use the original approach: sync donors, projects, and donations separately
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

        // Sync projects BEFORE donations (so donations can reference them)
        if (this.provider.fetchProjects) {
          logger.info(`Starting project sync for organization ${organizationId}`, {
            organizationId,
            provider: this.provider.name,
            integrationId: integration.id,
          });
          const projectResult = await this.syncProjects(
            organizationId,
            integration.accessToken,
            integration.metadata as Record<string, any>
          );
          result.projects = projectResult;
        }

        // Then sync donations (after projects are synced)
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
        .update(staffIntegrations)
        .set({
          syncStatus: 'idle',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(staffIntegrations.id, integration.id));
    } catch (error) {
      logger.error('CRM sync failed', { error, organizationId, provider: this.provider.name });

      // Update sync status to 'error'
      await db
        .update(staffIntegrations)
        .set({
          syncStatus: 'error',
          syncError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(staffIntegrations.id, integration.id));

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
   * Sync projects from CRM
   */
  private async syncProjects(
    organizationId: string,
    accessToken: string,
    metadata: Record<string, any>
  ): Promise<CrmSyncResult['projects']> {
    const result = {
      total: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      errors: [] as any[],
      createdProjects: [] as Array<{ externalId: string; name: string }>,
      updatedProjects: [] as Array<{ externalId: string; name: string }>,
      unchangedProjects: [] as Array<{ externalId: string; name: string }>,
    };

    if (!this.provider.fetchProjects) {
      return result;
    }

    let hasMore = true;
    let pageToken: string | undefined;
    let pageNumber = 0;

    while (hasMore) {
      try {
        const response = await this.provider.fetchProjects(
          accessToken,
          { limit: 100, pageToken },
          metadata
        );

        pageNumber++;
        logger.info(
          `Fetched ${response.data.length} projects from ${this.provider.name} (page ${pageNumber})`,
          {
            organizationId,
            provider: this.provider.name,
            hasMore: response.hasMore,
          }
        );

        result.total += response.data.length;

        // Process projects in the current page
        for (const crmProject of response.data) {
          try {
            const externalId = `${this.provider.name}_${crmProject.externalId}`;

            // Check if project already exists
            const existingProject = await db.query.projects.findFirst({
              where: and(
                eq(projects.organizationId, organizationId),
                eq(projects.externalId, externalId)
              ),
            });

            const projectData = {
              organizationId,
              externalId,
              name: crmProject.name,
              description: crmProject.description || null,
              active: crmProject.active,
              goal: crmProject.goal || null,
              tags: crmProject.tags || null,
              external: false,
              updatedAt: new Date(),
            };

            if (!existingProject) {
              // Create new project
              const [newProject] = await db
                .insert(projects)
                .values({
                  ...projectData,
                  createdAt: new Date(),
                })
                .returning();

              result.created++;
              result.createdProjects!.push({
                externalId: crmProject.externalId,
                name: crmProject.name,
              });

              logger.debug('Created new project', {
                id: newProject.id,
                externalId,
                name: crmProject.name,
              });
            } else {
              // Check if update is needed
              const needsUpdate =
                existingProject.name !== crmProject.name ||
                existingProject.description !== (crmProject.description || null) ||
                existingProject.active !== crmProject.active ||
                existingProject.goal !== (crmProject.goal || null) ||
                JSON.stringify(existingProject.tags) !== JSON.stringify(crmProject.tags || null);

              if (needsUpdate) {
                // Update existing project
                await db
                  .update(projects)
                  .set(projectData)
                  .where(eq(projects.id, existingProject.id));

                result.updated++;
                result.updatedProjects!.push({
                  externalId: crmProject.externalId,
                  name: crmProject.name,
                });

                logger.debug('Updated project', {
                  id: existingProject.id,
                  externalId,
                  name: crmProject.name,
                });
              } else {
                result.unchanged++;
                result.unchangedProjects!.push({
                  externalId: crmProject.externalId,
                  name: crmProject.name,
                });
              }
            }
          } catch (error) {
            result.failed++;
            result.errors.push({
              externalId: crmProject.externalId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            logger.error('Failed to sync project', {
              error,
              projectExternalId: crmProject.externalId,
            });
          }
        }

        hasMore = response.hasMore;
        pageToken = response.nextPageToken;
      } catch (error) {
        logger.error(`Failed to fetch projects from ${this.provider.name}`, {
          error,
          organizationId,
          provider: this.provider.name,
          pageNumber,
        });
        throw error;
      }
    }

    logger.info(`Completed project sync from ${this.provider.name}`, {
      organizationId,
      provider: this.provider.name,
      totalPages: pageNumber,
      result,
    });

    return result;
  }

  /**
   * Batch upsert multiple donors
   * Returns operations for each donor
   */
  private async batchUpsertDonors(
    organizationId: string,
    crmDonors: CrmDonor[]
  ): Promise<Map<string, 'created' | 'updated' | 'unchanged'>> {
    const startTime = Date.now();
    const results = new Map<string, 'created' | 'updated' | 'unchanged'>();

    if (crmDonors.length === 0) return results;

    // Prepare all donor data
    const donorDataList = crmDonors.map((crmDonor) => {
      const externalId = `${this.provider.name}_${crmDonor.externalId}`;
      return {
        crmDonor,
        externalId: externalId.substring(0, 255),
        data: {
          organizationId,
          externalId: externalId.substring(0, 255),
          firstName: crmDonor.firstName.substring(0, 255),
          lastName: crmDonor.lastName.substring(0, 255),
          displayName: (
            crmDonor.displayName || `${crmDonor.firstName} ${crmDonor.lastName}`
          ).substring(0, 500),
          email: crmDonor.email.substring(0, 255),
          phone: crmDonor.phone?.substring(0, 20),
          address: this.formatAddress(crmDonor.address),
          isCouple: crmDonor.isCouple || false,
          hisFirstName: crmDonor.hisFirstName?.substring(0, 255),
          hisLastName: crmDonor.hisLastName?.substring(0, 255),
          herFirstName: crmDonor.herFirstName?.substring(0, 255),
          herLastName: crmDonor.herLastName?.substring(0, 255),
          updatedAt: new Date(),
        },
      };
    });

    // Batch fetch existing donors
    const externalIds = donorDataList.map((d) => d.externalId);
    const existingDonors = await db.query.donors.findMany({
      where: and(
        eq(donors.organizationId, organizationId),
        inArray(donors.externalId, externalIds)
      ),
    });

    // Create maps for quick lookup
    const existingDonorMap = new Map(existingDonors.map((d) => [d.externalId, d]));

    // Separate donors into create, update, and unchanged
    const toCreate: (typeof donorDataList)[0]['data'][] = [];
    const toUpdate: { id: number; data: (typeof donorDataList)[0]['data'] }[] = [];

    for (const { crmDonor, externalId, data } of donorDataList) {
      const existingDonor = existingDonorMap.get(externalId);

      if (existingDonor) {
        // Check if any data has changed
        const hasChanges =
          existingDonor.firstName !== data.firstName ||
          existingDonor.lastName !== data.lastName ||
          existingDonor.displayName !== data.displayName ||
          existingDonor.email !== data.email ||
          existingDonor.phone !== data.phone ||
          existingDonor.address !== data.address ||
          existingDonor.isCouple !== data.isCouple ||
          existingDonor.hisFirstName !== data.hisFirstName ||
          existingDonor.hisLastName !== data.hisLastName ||
          existingDonor.herFirstName !== data.herFirstName ||
          existingDonor.herLastName !== data.herLastName;

        if (hasChanges) {
          toUpdate.push({ id: existingDonor.id, data });
          results.set(crmDonor.externalId, 'updated');
        } else {
          results.set(crmDonor.externalId, 'unchanged');
        }
      } else {
        toCreate.push(data);
        results.set(crmDonor.externalId, 'created');
      }
    }

    // Batch insert new donors
    if (toCreate.length > 0) {
      await db.insert(donors).values(toCreate);
    }

    // Batch update existing donors
    if (toUpdate.length > 0) {
      // For better performance, update in chunks
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
        await db.transaction(async (tx) => {
          await Promise.all(
            chunk.map(({ id, data }) => tx.update(donors).set(data).where(eq(donors.id, id)))
          );
        });
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info('Batch upserted donors', {
      total: crmDonors.length,
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged: crmDonors.length - toCreate.length - toUpdate.length,
      timeMs: elapsed,
    });

    return results;
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
   * Batch upsert multiple donations
   * Returns operations for each donation
   */
  private async batchUpsertDonations(
    organizationId: string,
    crmDonations: Array<CrmDonation & { donorExternalId: string }>,
    defaultProjectId: number
  ): Promise<Map<string, 'created' | 'updated' | 'unchanged' | 'failed'>> {
    const startTime = Date.now();
    const results = new Map<string, 'created' | 'updated' | 'unchanged' | 'failed'>();

    if (crmDonations.length === 0) return results;

    // Prepare all donation data and collect unique donor external IDs
    const donorExternalIds = [
      ...new Set(crmDonations.map((d) => `${this.provider.name}_${d.donorExternalId}`)),
    ];

    // Collect unique campaign external IDs
    const campaignExternalIds = [
      ...new Set(
        crmDonations
          .filter((d) => d.campaignExternalId)
          .map((d) => `${this.provider.name}_${d.campaignExternalId}`)
      ),
    ];

    logger.info('📊 Campaign ID collection', {
      totalDonations: crmDonations.length,
      donationsWithCampaigns: crmDonations.filter((d) => d.campaignExternalId).length,
      uniqueCampaignIds: campaignExternalIds.length,
      sampleCampaignIds: campaignExternalIds.slice(0, 5),
    });

    // Batch fetch all donors
    const donorsMap = new Map(
      (
        await db.query.donors.findMany({
          where: and(
            eq(donors.organizationId, organizationId),
            inArray(donors.externalId, donorExternalIds)
          ),
        })
      ).map((d) => [d.externalId, d])
    );

    // Batch fetch all projects (campaigns)
    const projectsMap = new Map();
    if (campaignExternalIds.length > 0) {
      const projectsList = await db.query.projects.findMany({
        where: and(
          eq(projects.organizationId, organizationId),
          inArray(projects.externalId, campaignExternalIds)
        ),
      });
      projectsList.forEach((p) => projectsMap.set(p.externalId, p));

      logger.info('📁 Projects fetched for campaigns', {
        requestedCampaigns: campaignExternalIds.length,
        foundProjects: projectsList.length,
        projectExternalIds: projectsList.map((p) => p.externalId),
        projectNames: projectsList.map((p) => ({ externalId: p.externalId, name: p.name })),
      });
    }

    // Prepare donation data
    const donationDataList = crmDonations
      .map((crmDonation) => {
        const donorExternalId = `${this.provider.name}_${crmDonation.donorExternalId}`;
        const donationExternalId = `${this.provider.name}_${crmDonation.externalId}`;
        const donor = donorsMap.get(donorExternalId);

        if (!donor) {
          logger.warn(
            `Donation ${crmDonation.externalId} references non-existent donor ${donorExternalId}`
          );
          results.set(crmDonation.externalId, 'failed');
          return null;
        }

        // Look up project ID based on campaign
        let projectId = defaultProjectId;
        if (crmDonation.campaignExternalId) {
          const campaignExternalId = `${this.provider.name}_${crmDonation.campaignExternalId}`;
          const project = projectsMap.get(campaignExternalId);
          if (project) {
            projectId = project.id;
            logger.info('🎯 Found campaign project for donation', {
              donationId: crmDonation.externalId,
              campaignExternalId: crmDonation.campaignExternalId,
              fullCampaignExternalId: campaignExternalId,
              projectId: project.id,
              projectName: project.name,
            });
          } else {
            logger.warn('❌ Campaign not found for donation', {
              donationId: crmDonation.externalId,
              campaignExternalId: crmDonation.campaignExternalId,
              fullCampaignExternalId: campaignExternalId,
              availableProjects: Array.from(projectsMap.keys()),
            });
          }
        } else {
          logger.debug('No campaign ID for donation', {
            donationId: crmDonation.externalId,
            defaultProjectId,
          });
        }

        return {
          crmDonation,
          externalId: donationExternalId.substring(0, 255),
          data: {
            externalId: donationExternalId.substring(0, 255),
            donorId: donor.id,
            projectId,
            amount: crmDonation.amount,
            currency: crmDonation.currency || 'USD',
            date: crmDonation.date,
            updatedAt: new Date(),
          },
        };
      })
      .filter((d) => d !== null) as Array<{
      crmDonation: CrmDonation;
      externalId: string;
      data: any;
    }>;

    if (donationDataList.length === 0) return results;

    // Batch fetch existing donations
    const donationExternalIds = donationDataList.map((d) => d.externalId);
    const existingDonations = await db.query.donations.findMany({
      where: inArray(donations.externalId, donationExternalIds),
      with: {
        donor: true,
      },
    });

    // Create map for quick lookup (filter by organization)
    const existingDonationMap = new Map(
      existingDonations
        .filter((d) => d.donor && d.donor.organizationId === organizationId)
        .map((d) => [d.externalId, d])
    );

    // Separate donations into create, update, and unchanged
    const toCreate: (typeof donationDataList)[0]['data'][] = [];
    const toUpdate: { id: number; data: (typeof donationDataList)[0]['data'] }[] = [];

    // Debug logging for first few donations
    let debugCount = 0;

    for (const { crmDonation, externalId, data } of donationDataList) {
      const existingDonation = existingDonationMap.get(externalId);

      if (existingDonation) {
        // Check if any data has changed
        const dateChanged = existingDonation.date.getTime() !== data.date.getTime();
        const hasChanges =
          existingDonation.donorId !== data.donorId ||
          existingDonation.projectId !== data.projectId ||
          existingDonation.amount !== data.amount ||
          existingDonation.currency !== data.currency ||
          dateChanged;

        // Debug log first few comparisons
        if (debugCount < 3) {
          logger.info('🔍 Donation comparison debug', {
            externalId: crmDonation.externalId,
            existingDate: existingDonation.date.toISOString(),
            existingDateTime: existingDonation.date.getTime(),
            newDate: data.date.toISOString(),
            newDateTime: data.date.getTime(),
            dateChanged,
            hasChanges,
          });
          debugCount++;
        }

        if (hasChanges) {
          toUpdate.push({ id: existingDonation.id, data });
          results.set(crmDonation.externalId, 'updated');
        } else {
          results.set(crmDonation.externalId, 'unchanged');
        }
      } else {
        toCreate.push(data);
        results.set(crmDonation.externalId, 'created');
      }
    }

    // Batch insert new donations
    if (toCreate.length > 0) {
      // Log first donation being inserted
      logger.info('💾 DB INSERT - First Donation Example', {
        externalId: toCreate[0].externalId,
        donorId: toCreate[0].donorId,
        projectId: toCreate[0].projectId,
        amount: toCreate[0].amount,
        currency: toCreate[0].currency,
        date: toCreate[0].date.toISOString(),
        dateTimestamp: toCreate[0].date.getTime(),
      });

      await db.insert(donations).values(toCreate);
    }

    // Batch update existing donations
    if (toUpdate.length > 0) {
      // Log first donation being updated
      logger.info('💾 DB UPDATE - First Donation Example', {
        id: toUpdate[0].id,
        externalId: toUpdate[0].data.externalId,
        donorId: toUpdate[0].data.donorId,
        projectId: toUpdate[0].data.projectId,
        amount: toUpdate[0].data.amount,
        currency: toUpdate[0].data.currency,
        date: toUpdate[0].data.date.toISOString(),
        dateTimestamp: toUpdate[0].data.date.getTime(),
      });

      // For better performance with large updates, use raw SQL with CASE statements
      const CHUNK_SIZE = 500;

      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
        const ids = chunk.map((u) => u.id);

        // Build SQL CASE statements for each field
        const donorIdCase = chunk.map((u) => `WHEN ${u.id} THEN ${u.data.donorId}`).join(' ');
        const projectIdCase = chunk.map((u) => `WHEN ${u.id} THEN ${u.data.projectId}`).join(' ');
        const amountCase = chunk.map((u) => `WHEN ${u.id} THEN ${u.data.amount}`).join(' ');
        const currencyCase = chunk.map((u) => `WHEN ${u.id} THEN '${u.data.currency}'`).join(' ');
        const dateCase = chunk
          .map((u) => `WHEN ${u.id} THEN '${u.data.date.toISOString()}'::timestamp`)
          .join(' ');

        // Execute batch update
        await db.execute(
          sql`UPDATE donations SET
            donor_id = CASE id ${sql.raw(donorIdCase)} END,
            project_id = CASE id ${sql.raw(projectIdCase)} END,
            amount = CASE id ${sql.raw(amountCase)} END,
            currency = CASE id ${sql.raw(currencyCase)} END,
            date = CASE id ${sql.raw(dateCase)} END,
            updated_at = NOW()
          WHERE id IN (${sql.raw(ids.join(','))})`
        );
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info('Batch upserted donations', {
      total: crmDonations.length,
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged: results.size - toCreate.length - toUpdate.length,
      failed: crmDonations.length - results.size,
      timeMs: elapsed,
    });

    return results;
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

    // Look up project ID based on campaign
    let projectId = defaultProjectId;
    if (crmDonation.campaignExternalId) {
      const campaignExternalId = `${this.provider.name}_${crmDonation.campaignExternalId}`;
      const project = await db.query.projects.findFirst({
        where: and(
          eq(projects.organizationId, organizationId),
          eq(projects.externalId, campaignExternalId)
        ),
      });
      if (project) {
        projectId = project.id;
      } else {
        logger.debug('Campaign not found for donation', {
          donationId: crmDonation.externalId,
          campaignExternalId: crmDonation.campaignExternalId,
        });
      }
    }

    // Check if donation exists
    const existingDonation = await db.query.donations.findFirst({
      where: eq(donations.externalId, donationExternalId),
    });

    const donationData = {
      donorId: donor.id,
      projectId,
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

        // Process all donors and donations in batches
        const batchStartTime = Date.now();

        // Extract donors and all donations
        const donorsToProcess = response.data.map(({ donations, ...donor }) => donor);
        const allDonations: Array<CrmDonation & { donorExternalId: string }> = [];

        for (const donorWithDonations of response.data) {
          if (donorWithDonations.donations) {
            for (const donation of donorWithDonations.donations) {
              allDonations.push({
                ...donation,
                donorExternalId: donorWithDonations.externalId,
              });
            }
          }
        }

        // Batch upsert all donors
        const donorOperations = await this.batchUpsertDonors(organizationId, donorsToProcess);

        // Process donor results
        for (const donor of donorsToProcess) {
          const operation = donorOperations.get(donor.externalId);
          const donorInfo = {
            externalId: donor.externalId,
            displayName: donor.displayName || `${donor.firstName} ${donor.lastName}`,
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
        }

        // Batch upsert all donations
        if (allDonations.length > 0) {
          donationResult.total += allDonations.length;
          const donationOperations = await this.batchUpsertDonations(
            organizationId,
            allDonations,
            defaultProject.id
          );

          // Process donation results
          for (const donation of allDonations) {
            const operation = donationOperations.get(donation.externalId);
            const donationInfo = {
              externalId: donation.externalId,
              amount: donation.amount,
              date: donation.date,
            };

            if (operation === 'created') {
              donationResult.created++;
              if (donationResult.createdDonations.length < 100) {
                donationResult.createdDonations.push(donationInfo);
              }
            } else if (operation === 'updated') {
              donationResult.updated++;
              if (donationResult.updatedDonations.length < 100) {
                donationResult.updatedDonations.push(donationInfo);
              }
            } else if (operation === 'unchanged') {
              donationResult.unchanged++;
              if (donationResult.unchangedDonations.length < 100) {
                donationResult.unchangedDonations.push(donationInfo);
              }
            } else if (operation === 'failed') {
              donationResult.failed++;
            }
          }
        }

        const batchElapsed = Date.now() - batchStartTime;
        logger.info('Processed batch of donors and donations', {
          donors: donorsToProcess.length,
          donations: allDonations.length,
          timeMs: batchElapsed,
        });

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
