import { OrganizationsService, type UpdateOrganizationInput } from '@/app/lib/services/organizations.service';
import { TRPCError } from '@trpc/server';
import * as orgData from '@/app/lib/data/organizations';
import * as userData from '@/app/lib/data/users';
import { DonorJourneyService } from '@/app/lib/services/donor-journey.service';
import { tasks } from '@trigger.dev/sdk/v3';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/data/organizations');
jest.mock('@/app/lib/data/users');
jest.mock('@/app/lib/services/donor-journey.service');
jest.mock('@trigger.dev/sdk/v3');
jest.mock('@/app/lib/logger');

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(() => {
    service = new OrganizationsService();
    jest.clearAllMocks();
  });

  describe('getOrganization', () => {
    it('should return organization when found', async () => {
      const mockOrg = { id: 'org123', name: 'Test Org' };
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue(mockOrg);

      const result = await service.getOrganization('org123');

      expect(orgData.getOrganizationById).toHaveBeenCalledWith('org123');
      expect(result).toEqual(mockOrg);
    });

    it('should throw TRPCError when organization not found', async () => {
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue(null);

      await expect(service.getOrganization('org123')).rejects.toThrow(TRPCError);
      await expect(service.getOrganization('org123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Organization with ID org123 not found'),
      });
    });

    it('should handle database errors', async () => {
      (orgData.getOrganizationById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.getOrganization('org123')).rejects.toThrow(TRPCError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateOrganizationWithWebsiteCrawl', () => {
    const mockOrg = {
      id: 'org123',
      name: 'Test Org',
      websiteUrl: 'https://old-site.com',
    };

    beforeEach(() => {
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue(mockOrg);
      (orgData.updateOrganization as jest.Mock).mockResolvedValue({ ...mockOrg, websiteUrl: 'https://new-site.com' });
      (tasks.trigger as jest.Mock).mockResolvedValue({ id: 'task123' });
    });

    it('should update organization without triggering crawl when URL unchanged', async () => {
      const input: UpdateOrganizationInput = {
        description: 'Updated description',
      };

      const result = await service.updateOrganizationWithWebsiteCrawl('org123', input);

      expect(orgData.updateOrganization).toHaveBeenCalledWith('org123', input);
      expect(tasks.trigger).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should trigger website crawl when URL changes', async () => {
      const input: UpdateOrganizationInput = {
        websiteUrl: 'https://new-site.com',
      };

      await service.updateOrganizationWithWebsiteCrawl('org123', input);

      expect(tasks.trigger).toHaveBeenCalledWith(
        'crawl-and-summarize-website',
        {
          organizationId: 'org123',
          url: 'https://new-site.com',
        }
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Triggered crawl task'));
    });

    it('should handle null URL changes', async () => {
      const input: UpdateOrganizationInput = {
        websiteUrl: null,
      };

      await service.updateOrganizationWithWebsiteCrawl('org123', input);

      expect(tasks.trigger).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not updated or no valid new URL'));
    });

    it('should throw error when organization not found', async () => {
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOrganizationWithWebsiteCrawl('org123', {})
      ).rejects.toThrow(TRPCError);
    });

    it('should throw error when update fails', async () => {
      (orgData.updateOrganization as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOrganizationWithWebsiteCrawl('org123', {})
      ).rejects.toThrow(TRPCError);
    });

    it('should log error when crawl trigger fails', async () => {
      const input: UpdateOrganizationInput = {
        websiteUrl: 'https://new-site.com',
      };

      (tasks.trigger as jest.Mock).mockRejectedValue(new Error('Trigger failed'));

      await service.updateOrganizationWithWebsiteCrawl('org123', input);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger crawl task')
      );
    });
  });

  describe('moveMemoryFromUserToOrganization', () => {
    const mockUser = {
      id: 'user123',
      memory: ['Memory 1', 'Memory 2', 'Memory 3'],
    };

    const mockOrg = {
      id: 'org123',
      memory: ['Org Memory 1'],
    };

    beforeEach(() => {
      (userData.getUserById as jest.Mock).mockResolvedValue(mockUser);
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue(mockOrg);
      (userData.updateUserMemory as jest.Mock).mockResolvedValue(true);
      (orgData.updateOrganization as jest.Mock).mockResolvedValue(true);
    });

    it('should move memory from user to organization', async () => {
      await service.moveMemoryFromUserToOrganization('user123', 'org123', { memoryIndex: 1 });

      expect(userData.updateUserMemory).toHaveBeenCalledWith('user123', ['Memory 1', 'Memory 3']);
      expect(orgData.updateOrganization).toHaveBeenCalledWith('org123', {
        memory: ['Org Memory 1', 'Memory 2'],
      });
    });

    it('should handle empty organization memory', async () => {
      (orgData.getOrganizationById as jest.Mock).mockResolvedValue({
        ...mockOrg,
        memory: null,
      });

      await service.moveMemoryFromUserToOrganization('user123', 'org123', { memoryIndex: 0 });

      expect(orgData.updateOrganization).toHaveBeenCalledWith('org123', {
        memory: ['Memory 1'],
      });
    });

    it('should throw error for invalid memory index', async () => {
      await expect(
        service.moveMemoryFromUserToOrganization('user123', 'org123', { memoryIndex: 10 })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw error when user not found', async () => {
      (userData.getUserById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.moveMemoryFromUserToOrganization('user123', 'org123', { memoryIndex: 0 })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('processAndUpdateDonorJourney', () => {
    beforeEach(() => {
      (DonorJourneyService.processJourney as jest.Mock) = jest.fn();
    });

    it('should process and update donor journey', async () => {
      const journeyText = 'Test journey description';
      const mockGraph = { nodes: [], edges: [] };
      
      (DonorJourneyService.processJourney as jest.Mock).mockResolvedValue(mockGraph);
      (orgData.updateDonorJourney as jest.Mock).mockResolvedValue(true);
      (orgData.updateDonorJourneyText as jest.Mock).mockResolvedValue(true);

      const result = await service.processAndUpdateDonorJourney('org123', journeyText);

      expect(DonorJourneyService.processJourney).toHaveBeenCalledWith(journeyText);
      expect(orgData.updateDonorJourney).toHaveBeenCalledWith('org123', mockGraph);
      expect(orgData.updateDonorJourneyText).toHaveBeenCalledWith('org123', journeyText);
      expect(result).toBeDefined();
    });

    it('should handle processing errors', async () => {
      (DonorJourneyService.processJourney as jest.Mock).mockRejectedValue(new Error('AI error'));

      await expect(
        service.processAndUpdateDonorJourney('org123', 'description')
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('updateOrganizationDonorJourney', () => {
    it('should update donor journey', async () => {
      const journey = { nodes: [], edges: [] };
      (orgData.updateDonorJourney as jest.Mock).mockResolvedValue(true);

      await service.updateOrganizationDonorJourney('org123', journey);

      expect(orgData.updateDonorJourney).toHaveBeenCalledWith('org123', journey);
    });

    it('should handle update errors', async () => {
      (orgData.updateDonorJourney as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(
        service.updateOrganizationDonorJourney('org123', {})
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getOrganizationDonorJourney', () => {
    it('should get donor journey', async () => {
      const mockJourney = { nodes: [], edges: [] };
      (orgData.getDonorJourney as jest.Mock).mockResolvedValue(mockJourney);

      const result = await service.getOrganizationDonorJourney('org123');

      expect(orgData.getDonorJourney).toHaveBeenCalledWith('org123');
      expect(result).toEqual(mockJourney);
    });

    it('should return empty journey when not found', async () => {
      (orgData.getDonorJourney as jest.Mock).mockResolvedValue(null);

      const result = await service.getOrganizationDonorJourney('org123');

      expect(result).toEqual({ nodes: [], edges: [] });
    });
  });

  describe('updateOrganizationDonorJourneyText', () => {
    it('should update donor journey text', async () => {
      (orgData.updateDonorJourneyText as jest.Mock).mockResolvedValue(true);

      await service.updateOrganizationDonorJourneyText('org123', 'New journey text');

      expect(orgData.updateDonorJourneyText).toHaveBeenCalledWith('org123', 'New journey text');
    });
  });

  describe('getOrganizationDonorJourneyText', () => {
    it('should get donor journey text', async () => {
      (orgData.getDonorJourneyText as jest.Mock).mockResolvedValue('Journey text');

      const result = await service.getOrganizationDonorJourneyText('org123');

      expect(orgData.getDonorJourneyText).toHaveBeenCalledWith('org123');
      expect(result).toBe('Journey text');
    });

    it('should return empty string when not found', async () => {
      (orgData.getDonorJourneyText as jest.Mock).mockResolvedValue(null);

      const result = await service.getOrganizationDonorJourneyText('org123');

      expect(result).toBe('');
    });
  });
});