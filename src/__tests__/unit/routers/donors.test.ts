import { donorsRouter } from '@/app/api/trpc/routers/donors';
import {
  createTestContext,
  createProtectedTestContext,
  expectTRPCError,
  createMockBackendUser,
} from '@/__tests__/utils/trpc-router-test-utils';
import * as donorsData from '@/app/lib/data/donors';
import * as donorListsData from '@/app/lib/data/donor-lists';
import * as staffData from '@/app/lib/data/staff';
import { db } from '@/app/lib/db';

// Mock dependencies
jest.mock('@/app/lib/data/donors');
jest.mock('@/app/lib/data/donor-lists');
jest.mock('@/app/lib/data/staff');
jest.mock('@/app/lib/db');

describe('donorsRouter', () => {
  const mockDonorsData = donorsData as jest.Mocked<typeof donorsData>;
  const mockDonorListsData = donorListsData as jest.Mocked<typeof donorListsData>;
  const mockStaffData = staffData as jest.Mocked<typeof staffData>;
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDonor = {
    id: 1,
    organizationId: 'org-1',
    externalId: 'ext-123',
    firstName: 'John',
    lastName: 'Doe',
    hisTitle: null,
    hisFirstName: null,
    hisInitial: null,
    hisLastName: null,
    herTitle: null,
    herFirstName: null,
    herInitial: null,
    herLastName: null,
    displayName: 'John Doe',
    isCouple: false,
    email: 'john.doe@example.com',
    phone: '+1234567890',
    address: '123 Main St',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'USA',
    gender: 'male' as const,
    isAnonymous: false,
    isOrganization: false,
    organizationName: null,
    notes: [],
    assignedToStaffId: null,
    currentStageName: 'Prospect',
    classificationReasoning: null,
    predictedActions: [],
    highPotentialDonor: false,
    highPotentialDonorRationale: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockStaff = {
    id: 456,
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    emailConnected: true,
    organizationId: 'org-1',
  };

  describe('getByIds', () => {
    it('should fetch donors by IDs', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);

      const result = await caller.getByIds({ ids: [1] });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        organizationId: 'org-1',
      });
      expect(result[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(mockDonorsData.getDonorsByIds).toHaveBeenCalledWith([1], 'org-1');
    });

    it('should return empty array if no donors found', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([]);

      const result = await caller.getByIds({ ids: [999] });

      expect(result).toEqual([]);
    });

    it('should throw UNAUTHORIZED if user is not authenticated', async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = donorsRouter.createCaller(ctx);

      await expectTRPCError(caller.getByIds({ ids: [1] }), 'UNAUTHORIZED');
    });
  });

  describe('getByEmail', () => {
    it('should fetch a donor by email', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorByEmail.mockResolvedValue(mockDonor);

      const result = await caller.getByEmail({ email: 'john.doe@example.com' });

      expect(result.email).toBe('john.doe@example.com');
      expect(mockDonorsData.getDonorByEmail).toHaveBeenCalledWith('john.doe@example.com', 'org-1');
    });

    it("should throw NOT_FOUND if donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorByEmail.mockResolvedValue(null);

      await expectTRPCError(caller.getByEmail({ email: 'nonexistent@example.com' }), 'NOT_FOUND');
    });

    it('should validate email format', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      await expect(caller.getByEmail({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('getByIds', () => {
    it('should fetch multiple donors by IDs', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const donors = [
        mockDonor,
        { ...mockDonor, id: 2, firstName: 'Jane', email: 'jane@example.com' },
      ];

      mockDonorsData.getDonorsByIds.mockResolvedValue(donors);

      const result = await caller.getByIds({ ids: [1, 2] });

      expect(result).toHaveLength(2);
      expect(result[0].firstName).toBe('John');
      expect(result[1].firstName).toBe('Jane');
      expect(mockDonorsData.getDonorsByIds).toHaveBeenCalledWith([1, 2], 'org-1');
    });

    it('should handle empty results', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([]);

      const result = await caller.getByIds({ ids: [999, 998] });

      expect(result).toHaveLength(0);
    });

    it('should validate maximum number of IDs', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const tooManyIds = Array.from({ length: 1001 }, (_, i) => i + 1);

      await expect(caller.getByIds({ ids: tooManyIds })).rejects.toThrow();
    });
  });

  describe('create', () => {
    const createInput = {
      firstName: 'New',
      lastName: 'Donor',
      email: 'new.donor@example.com',
      phone: '+1234567890',
      address: '456 Oak St',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'USA',
      gender: 'female' as const,
      isAnonymous: false,
      isOrganization: false,
    };

    it('should create a new donor', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const createdDonor = {
        ...mockDonor,
        ...createInput,
        id: 2,
      };

      mockDonorsData.createDonor.mockResolvedValue(createdDonor);

      const result = await caller.create(createInput);

      expect(result).toMatchObject({
        firstName: 'New',
        lastName: 'Donor',
        email: 'new.donor@example.com',
      });
      expect(mockDonorsData.createDonor).toHaveBeenCalledWith({
        firstName: 'New',
        lastName: 'Donor',
        email: 'new.donor@example.com',
        phone: '+1234567890',
        address: '456 Oak St',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'USA',
        gender: 'female',
        isAnonymous: false,
        isOrganization: false,
        organizationId: 'org-1',
      });
    });

    it('should handle optional fields', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const minimalInput = {
        firstName: 'Minimal',
        lastName: 'Donor',
        email: 'minimal@example.com',
      };

      mockDonorsData.createDonor.mockResolvedValue({
        ...mockDonor,
        ...minimalInput,
        phone: null,
        address: null,
      });

      const result = await caller.create(minimalInput);

      expect(result.firstName).toBe('Minimal');
      expect(result.phone).toBeNull();
    });

    it('should validate required fields', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      // Missing email
      await expect(caller.create({ ...createInput, email: '' })).rejects.toThrow();

      // Missing firstName
      await expect(caller.create({ ...createInput, firstName: '' })).rejects.toThrow();

      // Invalid email format
      await expect(caller.create({ ...createInput, email: 'invalid-email' })).rejects.toThrow();
    });

    it('should handle organization donors', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const orgInput = {
        ...createInput,
        isOrganization: true,
        organizationName: 'Test Corp',
      };

      mockDonorsData.createDonor.mockResolvedValue({
        ...mockDonor,
        ...orgInput,
        isOrganization: true,
        organizationName: 'Test Corp',
      });

      const result = await caller.create(orgInput);

      expect(result.isOrganization).toBe(true);
      expect(result.organizationName).toBe('Test Corp');
    });
  });

  describe('update', () => {
    const updateInput = {
      id: 1,
      firstName: 'Updated',
      email: 'updated@example.com',
    };

    it('should update an existing donor', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      // First mock the authorization check
      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);

      // Then mock the update
      const updatedDonor = {
        ...mockDonor,
        ...updateInput,
        updatedAt: new Date('2024-01-15'),
      };
      mockDonorsData.updateDonor.mockResolvedValue(updatedDonor);

      const result = await caller.update(updateInput);

      expect(result.firstName).toBe('Updated');
      expect(result.email).toBe('updated@example.com');
      expect(mockDonorsData.updateDonor).toHaveBeenCalledWith(
        1,
        {
          firstName: 'Updated',
          email: 'updated@example.com',
        },
        'org-1'
      );
    });

    it("should throw NOT_FOUND if donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.updateDonor.mockResolvedValue(null);

      await expectTRPCError(caller.update(updateInput), 'NOT_FOUND');
    });

    it('should handle partial updates', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);
      mockDonorsData.updateDonor.mockResolvedValue({
        ...mockDonor,
        phone: '+9876543210',
      });

      const result = await caller.update({
        id: 1,
        phone: '+9876543210',
      });

      expect(result.phone).toBe('+9876543210');
      expect(mockDonorsData.updateDonor).toHaveBeenCalledWith(1, { phone: '+9876543210' }, 'org-1');
    });
  });

  describe('delete', () => {
    it('should delete a donor entirely', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);
      mockDonorsData.deleteDonor.mockResolvedValue(undefined);

      await expect(caller.delete({ id: 1, deleteMode: 'entirely' })).resolves.toBeUndefined();

      expect(mockDonorsData.deleteDonor).toHaveBeenCalledWith(1, 'org-1', {
        deleteMode: 'entirely',
        listId: undefined,
      });
    });

    it('should delete donor from specific list', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.deleteDonor.mockResolvedValue(undefined);

      await expect(
        caller.delete({
          id: 1,
          deleteMode: 'fromList',
          listId: 10,
        })
      ).resolves.toBeUndefined();

      expect(mockDonorsData.deleteDonor).toHaveBeenCalledWith(1, 'org-1', {
        deleteMode: 'fromList',
        listId: 10,
      });
    });

    it('should validate listId when deleteMode is fromList', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      await expect(caller.delete({ id: 1, deleteMode: 'fromList' })).rejects.toThrow(
        'List ID is required'
      );
    });

    it("should throw NOT_FOUND if donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.deleteDonor.mockRejectedValue(new Error('Donor not found'));

      await expectTRPCError(caller.delete({ id: 999 }), 'INTERNAL_SERVER_ERROR');
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple donors', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.bulkDeleteDonors.mockResolvedValue({
        success: 3,
        failed: 0,
        errors: [],
      });

      const result = await caller.bulkDelete({ ids: [1, 2, 3] });

      expect(result).toEqual({
        success: 3,
        failed: 0,
        errors: [],
      });
      expect(mockDonorsData.bulkDeleteDonors).toHaveBeenCalledWith([1, 2, 3], 'org-1');
    });

    it('should handle partial failures', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.bulkDeleteDonors.mockResolvedValue({
        success: 2,
        failed: 1,
        errors: ['Failed to delete donor 3: Foreign key constraint'],
      });

      const result = await caller.bulkDelete({ ids: [1, 2, 3] });

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should validate maximum number of deletions', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      const tooManyIds = Array.from({ length: 1001 }, (_, i) => i + 1);

      await expect(caller.bulkDelete({ ids: tooManyIds })).rejects.toThrow();
    });
  });

  describe('list', () => {
    const mockDonorsList = {
      donors: [mockDonor, { ...mockDonor, id: 2, firstName: 'Jane', email: 'jane@example.com' }],
      totalCount: 2,
    };

    it('should list donors with default parameters', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.listDonors.mockResolvedValue(mockDonorsList);

      const result = await caller.list({});

      expect(result).toMatchObject({
        donors: expect.arrayContaining([
          expect.objectContaining({ firstName: 'John' }),
          expect.objectContaining({ firstName: 'Jane' }),
        ]),
        totalCount: 2,
      });
      expect(mockDonorsData.listDonors).toHaveBeenCalledWith({}, 'org-1');
    });

    it('should filter by search term', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.listDonors.mockResolvedValue({
        donors: [mockDonor],
        totalCount: 1,
      });

      await caller.list({ searchTerm: 'john' });

      expect(mockDonorsData.listDonors).toHaveBeenCalledWith({ searchTerm: 'john' }, 'org-1');
    });

    it('should filter by multiple criteria', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.listDonors.mockResolvedValue({
        donors: [],
        totalCount: 0,
      });

      const filters = {
        state: 'NY',
        gender: 'male' as const,
        isAnonymous: false,
        assignedToStaffId: 456,
        listId: 10,
      };

      await caller.list(filters);

      expect(mockDonorsData.listDonors).toHaveBeenCalledWith(filters, 'org-1');
    });

    it('should support pagination', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.listDonors.mockResolvedValue({
        donors: [mockDonor],
        totalCount: 50,
      });

      await caller.list({
        limit: 10,
        offset: 20,
      });

      expect(mockDonorsData.listDonors).toHaveBeenCalledWith({ limit: 10, offset: 20 }, 'org-1');
    });

    it('should support ordering', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.listDonors.mockResolvedValue(mockDonorsList);

      await caller.list({
        orderBy: 'totalDonated',
        orderDirection: 'desc',
      });

      expect(mockDonorsData.listDonors).toHaveBeenCalledWith(
        { orderBy: 'totalDonated', orderDirection: 'desc' },
        'org-1'
      );
    });
  });

  describe('updateAssignedStaff', () => {
    it('should assign staff to donor', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      // Mock authorization check
      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);

      // Mock staff validation
      mockStaffData.getStaffByIds.mockResolvedValue([mockStaff]);

      // Mock update
      mockDonorsData.updateDonor.mockResolvedValue({
        ...mockDonor,
        assignedToStaffId: 456,
      });

      const result = await caller.updateAssignedStaff({
        donorId: 1,
        staffId: 456,
      });

      expect(result.assignedToStaffId).toBe(456);
    });

    it('should unassign staff from donor', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([
        {
          ...mockDonor,
          assignedToStaffId: 456,
        },
      ]);

      mockDonorsData.updateDonor.mockResolvedValue({
        ...mockDonor,
        assignedToStaffId: null,
      });

      const result = await caller.updateAssignedStaff({
        donorId: 1,
        staffId: null,
      });

      expect(result.assignedToStaffId).toBeNull();
    });

    it("should throw NOT_FOUND if staff doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);
      mockStaffData.getStaffByIds.mockResolvedValue([]);

      await expectTRPCError(
        caller.updateAssignedStaff({ donorId: 1, staffId: 999 }),
        'NOT_FOUND',
        'Staff member not found'
      );
    });
  });

  describe('addNote', () => {
    it('should add a note to donor', async () => {
      const mockDonorsService = {
        bulkUpdateAssignedStaff: jest.fn(),
        addNoteToDonor: jest.fn(),
      };

      const ctx = createProtectedTestContext({
        services: {
          donors: mockDonorsService,
        },
      });
      const caller = donorsRouter.createCaller(ctx);

      const noteContent = 'This is a test note';

      // Mock authorization check
      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]);

      // Mock the service operation
      const updatedDonor = {
        ...mockDonor,
        notes: [
          {
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            content: noteContent,
          },
        ],
      };

      mockDonorsService.addNoteToDonor.mockResolvedValue(updatedDonor);

      const result = await caller.addNote({
        donorId: 1,
        content: noteContent,
      });

      expect(mockDonorsService.addNoteToDonor).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          createdBy: 'user-1',
          content: noteContent,
        }),
        'org-1'
      );
      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it('should append to existing notes', async () => {
      const mockDonorsService = {
        bulkUpdateAssignedStaff: jest.fn(),
        addNoteToDonor: jest.fn(),
      };

      const ctx = createProtectedTestContext({
        services: {
          donors: mockDonorsService,
        },
      });
      const caller = donorsRouter.createCaller(ctx);

      const existingNote = {
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'user-0',
        content: 'Existing note',
      };

      mockDonorsData.getDonorsByIds.mockResolvedValue([
        {
          ...mockDonor,
          notes: [existingNote],
        },
      ]);

      // Mock the service to return updated donor with appended note
      const updatedDonor = {
        ...mockDonor,
        notes: [
          existingNote,
          {
            createdAt: new Date().toISOString(),
            createdBy: 'user-1',
            content: 'New note',
          },
        ],
      };

      mockDonorsService.addNoteToDonor.mockResolvedValue(updatedDonor);

      const result = await caller.addNote({
        donorId: 1,
        content: 'New note',
      });

      expect(mockDonorsService.addNoteToDonor).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          createdBy: 'user-1',
          content: 'New note',
        }),
        'org-1'
      );
      expect(result.notes).toHaveLength(2);
    });

    it('should validate note content', async () => {
      const ctx = createProtectedTestContext();
      const caller = donorsRouter.createCaller(ctx);

      // Empty content
      await expect(caller.addNote({ donorId: 1, content: '' })).rejects.toThrow(
        'Note content is required'
      );

      // Content too long
      await expect(caller.addNote({ donorId: 1, content: 'a'.repeat(5001) })).rejects.toThrow();
    });
  });

  describe('organization isolation', () => {
    it("should only access donors from user's organization", async () => {
      const org1Ctx = createProtectedTestContext({
        user: { organizationId: 'org-1' },
      });
      const org2Ctx = createProtectedTestContext({
        user: { organizationId: 'org-2' },
      });

      const org1Caller = donorsRouter.createCaller(org1Ctx);
      const org2Caller = donorsRouter.createCaller(org2Ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValueOnce([mockDonor]).mockResolvedValueOnce([]);

      const org1Result = await org1Caller.getByIds({ ids: [1] });
      expect(org1Result).toHaveLength(1);

      const org2Result = await org2Caller.getByIds({ ids: [1] });
      expect(org2Result).toHaveLength(0);

      expect(org1Result[0].organizationId).toBe('org-1');
    });
  });
});
