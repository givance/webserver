import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import { logger } from "@/app/lib/logger";

type RouterOutput = inferRouterOutputs<AppRouter>;
type TRPCUtils = any; // This would be properly typed from trpc.useUtils()

/**
 * Standard cache invalidation patterns for common operations
 */
export const createCacheInvalidators = (utils: TRPCUtils) => ({
  /**
   * Invalidate all queries for a specific resource
   */
  invalidateResource: (resourceName: keyof RouterOutput) => {
    utils[resourceName].invalidate();
    logger.info(`Invalidating queries with root key ['${resourceName}']`);
  },

  /**
   * Invalidate specific queries for a resource
   */
  invalidateQueries: (resourceName: keyof RouterOutput, queryNames: string[]) => {
    queryNames.forEach((queryName) => {
      utils[resourceName][queryName].invalidate();
    });
    logger.info(`Invalidating queries: ${resourceName}.${queryNames.join(", ")}`);
  },

  /**
   * Invalidate and refetch queries
   */
  invalidateAndRefetch: (resourceName: keyof RouterOutput, queryNames?: string[]) => {
    if (queryNames) {
      queryNames.forEach((queryName) => {
        utils[resourceName][queryName].invalidate();
        utils[resourceName][queryName].refetch();
      });
    } else {
      utils[resourceName].invalidate();
      utils[resourceName].refetch();
    }
  },

  /**
   * Set specific data in the cache
   */
  setQueryData: <TData>(
    resourceName: keyof RouterOutput,
    queryName: string,
    input: any,
    updater: TData | ((old: TData | undefined) => TData | undefined)
  ) => {
    utils[resourceName][queryName].setData(input, updater);
  },
});

/**
 * Common invalidation patterns for cross-resource updates
 */
export const createCrossResourceInvalidators = (utils: TRPCUtils) => ({
  /**
   * Invalidate donor-related queries
   */
  invalidateDonorRelated: (donorId?: number) => {
    utils.donors.list.invalidate();
    if (donorId) {
      utils.donors.getById.invalidate({ id: donorId });
      utils.donations.getDonorStats.invalidate({ donorId });
      utils.lists.getListsForDonor.invalidate({ donorId });
    } else {
      utils.donors.getById.invalidate();
      utils.donations.getDonorStats.invalidate();
    }
  },

  /**
   * Invalidate list-related queries
   */
  invalidateListRelated: (listId?: number) => {
    utils.lists.list.invalidate();
    if (listId) {
      utils.lists.getById.invalidate({ id: listId });
      utils.lists.getByIdWithMemberCount.invalidate({ id: listId });
      utils.lists.getByIdWithMembers.invalidate({ id: listId });
    } else {
      utils.lists.invalidate();
    }
    utils.lists.getDonorIdsFromLists.invalidate();
  },

  /**
   * Invalidate staff-related queries
   */
  invalidateStaffRelated: (staffId?: number) => {
    utils.staff.list.invalidate();
    if (staffId) {
      utils.staff.getById.invalidate({ id: staffId });
      utils.staff.getAssignedDonors.invalidate({ staffId });
    } else {
      utils.staff.invalidate();
    }
    utils.staff.getPrimary.invalidate();
  },
});