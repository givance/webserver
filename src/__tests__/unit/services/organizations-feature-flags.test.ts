import { OrganizationsService } from '@/app/lib/services/organizations.service';
import { FeatureFlagService } from '@/app/lib/feature-flags/service';
import { FeatureFlagManager } from '@/app/lib/feature-flags/types';
import * as organizationsData from '@/app/lib/data/organizations';
import { env } from '@/app/lib/env';

// Mock dependencies
jest.mock('@/app/lib/data/organizations');
jest.mock('@/app/lib/data/users');
jest.mock('@/app/lib/services/donor-journey.service');
jest.mock('@/app/lib/logger');
jest.mock('@trigger.dev/sdk/v3');
jest.mock('@/app/lib/feature-flags/service');
jest.mock('@/app/lib/env', () => ({
  env: {
    USE_AGENTIC_FLOW: false,
    AZURE_OPENAI_RESOURCE_NAME: 'test-resource',
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_DEPLOYMENT_NAME: 'test-deployment',
  },
}));

describe('OrganizationsService - Feature Flags', () => {
  let service: OrganizationsService;
  const mockOrganizationId = 'org_123';

  const mockOrganization = {
    id: mockOrganizationId,
    name: 'Test Organization',
    websiteUrl: 'https://example.com',
    websiteSummary: null,
    description: 'Test description',
    shortDescription: 'Test short description',
    writingInstructions: null,
    memory: [],
    donorJourney: null,
    donorJourneyText: null,
    featureFlags: {
      use_o3_model: false,
      use_agentic_flow: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationsService();
  });

  describe('getOrganizationWithFeatureFlags', () => {
    it('should return organization with feature flags', async () => {
      // Mock getOrganizationById
      (organizationsData.getOrganizationById as jest.Mock).mockResolvedValue(mockOrganization);

      // Mock FeatureFlagService
      const mockFeatureFlagManager = new FeatureFlagManager({
        use_o3_model: false,
        use_agentic_flow: true,
      });
      (FeatureFlagService.getFeatureFlags as jest.Mock).mockResolvedValue(mockFeatureFlagManager);

      const result = await service.getOrganizationWithFeatureFlags(mockOrganizationId);

      expect(result).toEqual({
        ...mockOrganization,
        featureFlags: {
          use_o3_model: false,
          use_agentic_flow: true,
        },
      });

      expect(organizationsData.getOrganizationById).toHaveBeenCalledWith(mockOrganizationId);
      expect(FeatureFlagService.getFeatureFlags).toHaveBeenCalledWith(mockOrganizationId);
    });

    it('should throw error if organization not found', async () => {
      (organizationsData.getOrganizationById as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrganizationWithFeatureFlags(mockOrganizationId)).rejects.toThrow(
        'Organization'
      );
    });
  });

  describe('getOrganizationFeatureFlags', () => {
    it('should return feature flag manager for organization', async () => {
      const mockFeatureFlagManager = new FeatureFlagManager({
        use_o3_model: true,
        use_agentic_flow: false,
      });
      (FeatureFlagService.getFeatureFlags as jest.Mock).mockResolvedValue(mockFeatureFlagManager);

      const result = await service.getOrganizationFeatureFlags(mockOrganizationId);

      expect(result).toBe(mockFeatureFlagManager);
      expect(FeatureFlagService.getFeatureFlags).toHaveBeenCalledWith(mockOrganizationId);
    });
  });
});
