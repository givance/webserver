import { WhatsAppPermissionService } from '@/app/lib/services/whatsapp-permission.service';
import { db } from '@/app/lib/db';
import { logger } from '@/app/lib/logger';

// Mock dependencies
jest.mock('@/app/lib/db');
jest.mock('@/app/lib/logger');

// Create mock implementations
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockInnerJoin = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockValues = jest.fn();
const mockSet = jest.fn();

// Setup mock chain
const setupMockChain = () => {
  // Reset all mocks
  mockSelect.mockReset();
  mockFrom.mockReset();
  mockInnerJoin.mockReset();
  mockWhere.mockReset();
  mockLimit.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockValues.mockReset();
  mockSet.mockReset();
  
  // Setup select chain
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  
  // Setup insert chain
  mockInsert.mockReturnValue({ values: mockValues });
  
  // Setup update chain
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  
  // Setup delete chain
  mockDelete.mockReturnValue({ where: mockWhere });
};

describe('WhatsAppPermissionService', () => {
  let service: WhatsAppPermissionService;

  beforeEach(() => {
    service = new WhatsAppPermissionService();
    jest.clearAllMocks();
    setupMockChain();

    // Setup db mocks
    (db as any).select = mockSelect;
    (db as any).insert = mockInsert;
    (db as any).update = mockUpdate;
    (db as any).delete = mockDelete;
  });

  describe('checkPhonePermission', () => {
    it('should return allowed permission for registered phone with permission', async () => {
      const mockResult = [{
        staffId: 1,
        phoneNumber: '+11234567890',
        isAllowed: true,
        staffFirstName: 'John',
        staffLastName: 'Doe',
        staffEmail: 'john@example.com',
        organizationId: 'org123',
      }];

      mockLimit.mockResolvedValue(mockResult);

      const result = await service.checkPhonePermission('123-456-7890');

      expect(result).toEqual({
        isAllowed: true,
        staffId: 1,
        organizationId: 'org123',
        staff: {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          organizationId: 'org123',
        },
      });
    });

    it('should normalize phone numbers correctly', async () => {
      mockLimit.mockResolvedValue([]);

      // Test various phone formats
      await service.checkPhonePermission('(123) 456-7890');
      expect(mockWhere).toHaveBeenCalled();
      
      await service.checkPhonePermission('123.456.7890');
      expect(mockWhere).toHaveBeenCalled();
      
      await service.checkPhonePermission('+1 123 456 7890');
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return not allowed for unregistered phone number', async () => {
      mockLimit.mockResolvedValue([]);

      const result = await service.checkPhonePermission('999-999-9999');

      expect(result).toEqual({
        isAllowed: false,
        reason: 'Phone number not registered with any staff member',
      });
    });

    it('should return not allowed for disabled phone number', async () => {
      const mockResult = [{
        staffId: 2,
        phoneNumber: '+19999999999',
        isAllowed: false,
        staffFirstName: 'Jane',
        staffLastName: 'Smith',
        staffEmail: 'jane@example.com',
        organizationId: 'org456',
      }];

      mockLimit.mockResolvedValue(mockResult);

      const result = await service.checkPhonePermission('999-999-9999');

      expect(result).toEqual({
        isAllowed: false,
        staffId: 2,
        organizationId: 'org456',
        reason: 'Phone number access is disabled for this staff member',
      });
    });

    it('should handle database errors gracefully', async () => {
      mockSelect.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await service.checkPhonePermission('123-456-7890');

      expect(result).toEqual({
        isAllowed: false,
        reason: 'Internal error checking permissions',
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('addPhoneNumberToStaff', () => {
    it('should add phone number successfully', async () => {
      mockValues.mockResolvedValue(undefined);

      const result = await service.addPhoneNumberToStaff(1, '(555) 123-4567');

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        staffId: 1,
        phoneNumber: '+15551234567',
        isAllowed: true,
      });
      expect(result).toBe(true);
    });

    it('should normalize phone number before adding', async () => {
      await service.addPhoneNumberToStaff(1, '555.123.4567');

      expect(mockValues).toHaveBeenCalledWith({
        staffId: 1,
        phoneNumber: '+15551234567',
        isAllowed: true,
      });
    });

    it('should handle international numbers', async () => {
      await service.addPhoneNumberToStaff(1, '+44 20 7123 4567');

      expect(mockValues).toHaveBeenCalledWith({
        staffId: 1,
        phoneNumber: '+442071234567',
        isAllowed: true,
      });
    });

    it('should return false on database error', async () => {
      mockInsert.mockImplementation(() => {
        throw new Error('Duplicate key');
      });

      const result = await service.addPhoneNumberToStaff(1, '123-456-7890');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('removePhoneNumberFromStaff', () => {
    it('should remove phone number successfully', async () => {
      mockWhere.mockResolvedValue(undefined);

      const result = await service.removePhoneNumberFromStaff(1, '555-123-4567');

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should normalize phone number before removing', async () => {
      await service.removePhoneNumberFromStaff(1, '(555) 123-4567');

      expect(mockWhere).toHaveBeenCalled();
      // The where clause should use normalized number +15551234567
    });

    it('should return false on database error', async () => {
      mockDelete.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      const result = await service.removePhoneNumberFromStaff(1, '123-456-7890');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('togglePhonePermission', () => {
    it('should enable phone permission', async () => {
      mockWhere.mockResolvedValue(undefined);

      const result = await service.togglePhonePermission(1, '555-123-4567', true);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({
        isAllowed: true,
        updatedAt: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('should disable phone permission', async () => {
      mockWhere.mockResolvedValue(undefined);

      const result = await service.togglePhonePermission(1, '555-123-4567', false);

      expect(mockSet).toHaveBeenCalledWith({
        isAllowed: false,
        updatedAt: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('should return false on database error', async () => {
      mockUpdate.mockImplementation(() => {
        throw new Error('Update failed');
      });

      const result = await service.togglePhonePermission(1, '123-456-7890', true);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getStaffPhoneNumbers', () => {
    it('should return list of phone numbers for staff', async () => {
      const mockPhoneNumbers = [
        {
          phoneNumber: '+11234567890',
          isAllowed: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          phoneNumber: '+19876543210',
          isAllowed: false,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-03'),
        },
      ];

      mockWhere.mockResolvedValue(mockPhoneNumbers);

      const result = await service.getStaffPhoneNumbers(1);

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(mockPhoneNumbers);
    });

    it('should return empty array on error', async () => {
      mockSelect.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const result = await service.getStaffPhoneNumbers(1);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should normalize US phone numbers', () => {
      // Access private method through any type casting
      const normalizePhoneNumber = (service as any).normalizePhoneNumber.bind(service);

      expect(normalizePhoneNumber('(123) 456-7890')).toBe('+11234567890');
      expect(normalizePhoneNumber('123-456-7890')).toBe('+11234567890');
      expect(normalizePhoneNumber('123.456.7890')).toBe('+11234567890');
      expect(normalizePhoneNumber('1234567890')).toBe('+11234567890');
    });

    it('should handle numbers with country code', () => {
      const normalizePhoneNumber = (service as any).normalizePhoneNumber.bind(service);

      expect(normalizePhoneNumber('1-123-456-7890')).toBe('+11234567890');
      expect(normalizePhoneNumber('11234567890')).toBe('+11234567890');
    });

    it('should preserve international format', () => {
      const normalizePhoneNumber = (service as any).normalizePhoneNumber.bind(service);

      expect(normalizePhoneNumber('+44 20 7123 4567')).toBe('+442071234567');
      expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567');
    });

    it('should handle edge cases', () => {
      const normalizePhoneNumber = (service as any).normalizePhoneNumber.bind(service);

      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('123')).toBe('123'); // Too short to be normalized
      expect(normalizePhoneNumber('12345678901234')).toBe('12345678901234'); // Too long
    });
  });
});