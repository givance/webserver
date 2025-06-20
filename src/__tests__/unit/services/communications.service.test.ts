import { CommunicationsService } from '@/app/lib/services/communications.service';
import { TRPCError } from '@trpc/server';
import * as commData from '@/app/lib/data/communications';
import * as donorData from '@/app/lib/data/donors';
import * as staffData from '@/app/lib/data/staff';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/data/communications');
jest.mock('@/app/lib/data/donors');
jest.mock('@/app/lib/data/staff');
jest.mock('@/app/lib/logger');

describe('CommunicationsService', () => {
  let service: CommunicationsService;

  beforeEach(() => {
    service = new CommunicationsService();
    jest.clearAllMocks();
  });

  describe('authorizeThreadAccess', () => {
    const mockThread = {
      id: 1,
      channel: 'email' as const,
      staff: [{ staff: { organizationId: 'org123' } }],
      donors: [],
    };

    it('should return thread when organization has access via staff', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);

      const result = await service.authorizeThreadAccess(1, 'org123');

      expect(commData.getCommunicationThreadById).toHaveBeenCalledWith(1, {
        includeStaff: true,
        includeDonors: true,
      });
      expect(result).toEqual(mockThread);
    });

    it('should return thread when organization has access via donors', async () => {
      const threadWithDonor = {
        ...mockThread,
        staff: [],
        donors: [{ donor: { organizationId: 'org123' } }],
      };
      
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(threadWithDonor);

      const result = await service.authorizeThreadAccess(1, 'org123');

      expect(result).toEqual(threadWithDonor);
    });

    it('should throw NOT_FOUND when thread does not exist', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(null);

      await expect(service.authorizeThreadAccess(1, 'org123')).rejects.toThrow(TRPCError);
      await expect(service.authorizeThreadAccess(1, 'org123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Communication thread not found',
      });
    });

    it('should throw FORBIDDEN when organization has no access', async () => {
      const unauthorizedThread = {
        ...mockThread,
        staff: [{ staff: { organizationId: 'different-org' } }],
      };
      
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(unauthorizedThread);

      await expect(service.authorizeThreadAccess(1, 'org123')).rejects.toThrow(TRPCError);
      await expect(service.authorizeThreadAccess(1, 'org123')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Communication thread does not belong to your organization',
      });
    });

    it('should pass through include options', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);

      await service.authorizeThreadAccess(1, 'org123', {
        includeMessages: { limit: 10 },
      });

      expect(commData.getCommunicationThreadById).toHaveBeenCalledWith(1, {
        includeStaff: true,
        includeDonors: true,
        includeMessages: { limit: 10 },
      });
    });
  });

  describe('createThreadWithParticipants', () => {
    it('should create thread with staff and donors', async () => {
      const mockStaff = { id: 1, organizationId: 'org123' };
      const mockDonor = { id: 2, organizationId: 'org123' };
      const mockThread = { id: 1, channel: 'email' };

      (staffData.getStaffById as jest.Mock).mockResolvedValue(mockStaff);
      (donorData.getDonorById as jest.Mock).mockResolvedValue(mockDonor);
      (commData.createCommunicationThread as jest.Mock).mockResolvedValue(mockThread);

      const result = await service.createThreadWithParticipants(
        'email',
        [1],
        [2],
        'org123'
      );

      expect(staffData.getStaffById).toHaveBeenCalledWith(1, 'org123');
      expect(donorData.getDonorById).toHaveBeenCalledWith(2, 'org123');
      expect(commData.createCommunicationThread).toHaveBeenCalledWith(
        { channel: 'email' },
        [1],
        [2]
      );
      expect(result).toEqual(mockThread);
    });

    it('should throw error when staff not found', async () => {
      (staffData.getStaffById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createThreadWithParticipants('email', [999], undefined, 'org123')
      ).rejects.toThrow(TRPCError);
      
      await expect(
        service.createThreadWithParticipants('email', [999], undefined, 'org123')
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Staff member 999 not found in your organization',
      });
    });

    it('should throw error when donor not found', async () => {
      (donorData.getDonorById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createThreadWithParticipants('email', undefined, [888], 'org123')
      ).rejects.toThrow(TRPCError);
    });

    it('should handle creation failure', async () => {
      (commData.createCommunicationThread as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.createThreadWithParticipants('email', undefined, undefined, 'org123')
      ).rejects.toThrow(TRPCError);
      
      await expect(
        service.createThreadWithParticipants('email', undefined, undefined, 'org123')
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not create communication thread',
      });
    });
  });

  describe('listAuthorizedThreads', () => {
    const mockThreads = [
      {
        id: 1,
        channel: 'email',
        staff: [{ staffId: 1 }],
        donors: [{ donorId: 2 }],
      },
      {
        id: 2,
        channel: 'phone',
        staff: [{ staffId: 3 }],
        donors: [],
      },
    ];

    it('should list all threads for organization', async () => {
      (commData.listCommunicationThreads as jest.Mock).mockResolvedValue(mockThreads);

      const result = await service.listAuthorizedThreads({}, 'org123');

      expect(commData.listCommunicationThreads).toHaveBeenCalledWith({
        organizationId: 'org123',
      });
      expect(result.threads).toEqual(mockThreads);
      expect(result.totalCount).toBe(2);
    });

    it('should filter by staff ID', async () => {
      (commData.listCommunicationThreads as jest.Mock).mockResolvedValue(mockThreads);

      const result = await service.listAuthorizedThreads({ staffId: 1 }, 'org123');

      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].id).toBe(1);
    });

    it('should filter by donor ID', async () => {
      (commData.listCommunicationThreads as jest.Mock).mockResolvedValue(mockThreads);

      const result = await service.listAuthorizedThreads({ donorId: 2 }, 'org123');

      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].id).toBe(1);
    });

    it('should apply multiple filters', async () => {
      (commData.listCommunicationThreads as jest.Mock).mockResolvedValue(mockThreads);

      const result = await service.listAuthorizedThreads(
        { staffId: 1, donorId: 999 },
        'org123'
      );

      expect(result.threads).toHaveLength(0);
    });

    it('should pass through other options', async () => {
      (commData.listCommunicationThreads as jest.Mock).mockResolvedValue([]);

      await service.listAuthorizedThreads(
        {
          channel: 'email',
          limit: 10,
          offset: 20,
          includeStaff: true,
          includeDonors: true,
          includeLatestMessage: true,
        },
        'org123'
      );

      expect(commData.listCommunicationThreads).toHaveBeenCalledWith({
        channel: 'email',
        limit: 10,
        offset: 20,
        includeStaff: true,
        includeDonors: true,
        includeLatestMessage: true,
        organizationId: 'org123',
        staffId: undefined,
        donorId: undefined,
      });
    });
  });

  describe('addAuthorizedMessage', () => {
    it('should add message after authorization', async () => {
      const mockThread = {
        id: 1,
        staff: [{ staff: { organizationId: 'org123' } }],
        donors: [],
      };
      const mockMessage = { id: 1, content: 'Test message' };

      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (commData.addMessageToThread as jest.Mock).mockResolvedValue(mockMessage);

      const result = await service.addAuthorizedMessage(
        1,
        'Test message',
        1,
        undefined,
        undefined,
        2,
        'org123'
      );

      expect(commData.addMessageToThread).toHaveBeenCalledWith({
        threadId: 1,
        content: 'Test message',
        fromStaffId: 1,
        fromDonorId: undefined,
        toStaffId: undefined,
        toDonorId: 2,
      });
      expect(result).toEqual(mockMessage);
    });

    it('should throw error when authorization fails', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addAuthorizedMessage(1, 'Test', undefined, undefined, undefined, undefined, 'org123')
      ).rejects.toThrow(TRPCError);
    });

    it('should handle message creation failure', async () => {
      const mockThread = {
        id: 1,
        staff: [{ staff: { organizationId: 'org123' } }],
        donors: [],
      };

      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (commData.addMessageToThread as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        service.addAuthorizedMessage(1, 'Test', undefined, undefined, undefined, undefined, 'org123')
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not add message to thread',
      });
    });
  });

  describe('addAuthorizedParticipant', () => {
    const mockThread = {
      id: 1,
      staff: [{ staff: { organizationId: 'org123' } }],
      donors: [],
    };

    it('should add staff participant', async () => {
      const mockStaff = { id: 5, organizationId: 'org123' };
      
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (staffData.getStaffById as jest.Mock).mockResolvedValue(mockStaff);
      (commData.addStaffToThread as jest.Mock).mockResolvedValue(true);

      await service.addAuthorizedParticipant(1, 5, 'staff', 'org123');

      expect(staffData.getStaffById).toHaveBeenCalledWith(5, 'org123');
      expect(commData.addStaffToThread).toHaveBeenCalledWith(1, 5);
    });

    it('should add donor participant', async () => {
      const mockDonor = { id: 6, organizationId: 'org123' };
      
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (donorData.getDonorById as jest.Mock).mockResolvedValue(mockDonor);
      (commData.addDonorToThread as jest.Mock).mockResolvedValue(true);

      await service.addAuthorizedParticipant(1, 6, 'donor', 'org123');

      expect(donorData.getDonorById).toHaveBeenCalledWith(6, 'org123');
      expect(commData.addDonorToThread).toHaveBeenCalledWith(1, 6);
    });

    it('should throw error when participant not found', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (staffData.getStaffById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addAuthorizedParticipant(1, 999, 'staff', 'org123')
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Staff member not found in your organization',
      });
    });
  });

  describe('removeAuthorizedParticipant', () => {
    const mockThread = {
      id: 1,
      staff: [{ staff: { organizationId: 'org123' } }],
      donors: [],
    };

    it('should remove staff participant', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (commData.removeStaffFromThread as jest.Mock).mockResolvedValue(true);

      await service.removeAuthorizedParticipant(1, 5, 'staff', 'org123');

      expect(commData.removeStaffFromThread).toHaveBeenCalledWith(1, 5);
    });

    it('should remove donor participant', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (commData.removeDonorFromThread as jest.Mock).mockResolvedValue(true);

      await service.removeAuthorizedParticipant(1, 6, 'donor', 'org123');

      expect(commData.removeDonorFromThread).toHaveBeenCalledWith(1, 6);
    });

    it('should handle removal failure', async () => {
      (commData.getCommunicationThreadById as jest.Mock).mockResolvedValue(mockThread);
      (commData.removeStaffFromThread as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        service.removeAuthorizedParticipant(1, 5, 'staff', 'org123')
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not remove staff from thread',
      });
    });
  });
});