import { donationsRouter } from "@/app/api/trpc/routers/donations";
import {
  createTestContext,
  createProtectedTestContext,
  expectTRPCError,
} from "@/__tests__/utils/trpc-router-test-utils";
import * as donationsData from "@/app/lib/data/donations";
import * as donorsData from "@/app/lib/data/donors";
import * as projectsData from "@/app/lib/data/projects";

// Mock the data layers
jest.mock("@/app/lib/data/donations");
jest.mock("@/app/lib/data/donors");
jest.mock("@/app/lib/data/projects");

describe("donationsRouter", () => {
  const mockDonationsData = donationsData as jest.Mocked<typeof donationsData>;
  const mockDonorsData = donorsData as jest.Mocked<typeof donorsData>;
  const mockProjectsData = projectsData as jest.Mocked<typeof projectsData>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDonor = {
    id: 123,
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    organizationId: "org-1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const mockProject = {
    id: 456,
    name: "Annual Campaign",
    organizationId: "org-1",
    active: true,
    external: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  const mockDonation = {
    id: 1,
    amount: 10000, // $100.00 in cents
    donorId: 123,
    projectId: 456,
    currency: "USD",
    date: new Date("2024-01-15"),
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  };

  const mockDonationWithDetails = {
    ...mockDonation,
    donor: mockDonor,
    project: mockProject,
  };

  describe("getById", () => {
    it("should fetch a donation by ID", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(mockDonation);

      const result = await caller.getById({ id: 1 });

      expect(result).toEqual(mockDonation);
      expect(mockDonationsData.getDonationById).toHaveBeenCalledWith(1, {
        includeDonor: undefined,
        includeProject: undefined,
      });
    });

    it("should include donor and project details when requested", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);

      const result = await caller.getById({
        id: 1,
        includeDonor: true,
        includeProject: true,
      });

      expect(result).toEqual(mockDonationWithDetails);
      expect(result.donor).toBeDefined();
      expect(result.project).toBeDefined();
      expect(mockDonationsData.getDonationById).toHaveBeenCalledWith(1, {
        includeDonor: true,
        includeProject: true,
      });
    });

    it("should throw NOT_FOUND if donation doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(null);

      await expectTRPCError(
        caller.getById({ id: 999 }),
        "NOT_FOUND",
        "Donation not found"
      );
    });

    it("should throw UNAUTHORIZED if user is not authenticated", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = donationsRouter.createCaller(ctx);

      await expectTRPCError(caller.getById({ id: 1 }), "UNAUTHORIZED");
    });
  });

  describe("create", () => {
    const createInput = {
      amount: 15000, // $150.00
      donorId: 123,
      projectId: 456,
      currency: "USD",
    };

    it("should create a new donation", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(mockDonor);
      mockProjectsData.getProjectById.mockResolvedValue(mockProject);
      mockDonationsData.createDonation.mockResolvedValue({
        ...mockDonation,
        ...createInput,
        id: 2,
      });

      const result = await caller.create(createInput);

      expect(result.amount).toBe(15000);
      expect(result.donorId).toBe(123);
      expect(result.projectId).toBe(456);
      
      expect(mockDonorsData.getDonorById).toHaveBeenCalledWith(123, "org-1");
      expect(mockProjectsData.getProjectById).toHaveBeenCalledWith(456);
      expect(mockDonationsData.createDonation).toHaveBeenCalledWith(createInput);
    });

    it("should throw NOT_FOUND if donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(null);

      await expectTRPCError(
        caller.create(createInput),
        "NOT_FOUND",
        "The selected donor doesn't exist in your organization"
      );
    });

    it("should throw NOT_FOUND if project doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(mockDonor);
      mockProjectsData.getProjectById.mockResolvedValue(null);

      await expectTRPCError(
        caller.create(createInput),
        "NOT_FOUND",
        "The selected project doesn't exist in your organization"
      );
    });

    it("should throw NOT_FOUND if project belongs to different organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(mockDonor);
      mockProjectsData.getProjectById.mockResolvedValue({
        ...mockProject,
        organizationId: "org-2",
      });

      await expectTRPCError(
        caller.create(createInput),
        "NOT_FOUND",
        "The selected project doesn't exist in your organization"
      );
    });

    it("should use default currency if not provided", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const inputWithoutCurrency = {
        amount: 5000,
        donorId: 123,
        projectId: 456,
      };

      mockDonorsData.getDonorById.mockResolvedValue(mockDonor);
      mockProjectsData.getProjectById.mockResolvedValue(mockProject);
      mockDonationsData.createDonation.mockResolvedValue({
        ...mockDonation,
        ...inputWithoutCurrency,
        currency: "USD",
      });

      const result = await caller.create(inputWithoutCurrency);

      expect(result.currency).toBe("USD");
    });

    it("should validate amount is non-negative", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      await expect(
        caller.create({ ...createInput, amount: -100 })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    const updateInput = {
      id: 1,
      amount: 20000, // $200.00
    };

    it("should update an existing donation", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      // Mock authorization check
      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      
      // Mock update
      mockDonationsData.updateDonation.mockResolvedValue({
        ...mockDonation,
        amount: 20000,
      });

      const result = await caller.update(updateInput);

      expect(result.amount).toBe(20000);
      expect(mockDonationsData.updateDonation).toHaveBeenCalledWith(1, {
        amount: 20000,
      });
    });

    it("should update donor and verify organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const newDonorId = 789;
      const updateWithDonor = {
        id: 1,
        donorId: newDonorId,
      };

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      mockDonorsData.getDonorById.mockResolvedValue({
        ...mockDonor,
        id: newDonorId,
      });
      mockDonationsData.updateDonation.mockResolvedValue({
        ...mockDonation,
        donorId: newDonorId,
      });

      const result = await caller.update(updateWithDonor);

      expect(result.donorId).toBe(newDonorId);
      expect(mockDonorsData.getDonorById).toHaveBeenCalledWith(newDonorId, "org-1");
    });

    it("should update project and verify organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const newProjectId = 789;
      const updateWithProject = {
        id: 1,
        projectId: newProjectId,
      };

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      mockProjectsData.getProjectById.mockResolvedValue({
        ...mockProject,
        id: newProjectId,
      });
      mockDonationsData.updateDonation.mockResolvedValue({
        ...mockDonation,
        projectId: newProjectId,
      });

      const result = await caller.update(updateWithProject);

      expect(result.projectId).toBe(newProjectId);
      expect(mockProjectsData.getProjectById).toHaveBeenCalledWith(newProjectId);
    });

    it("should throw FORBIDDEN if donation doesn't belong to organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue({
        ...mockDonationWithDetails,
        donor: { ...mockDonor, organizationId: "org-2" },
      });

      await expectTRPCError(
        caller.update(updateInput),
        "FORBIDDEN",
        "You don't have permission to access this donation"
      );
    });

    it("should throw NOT_FOUND if donation doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(null);

      await expectTRPCError(
        caller.update(updateInput),
        "NOT_FOUND",
        "Donation not found"
      );
    });

    it("should handle date updates", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const newDate = new Date("2024-02-01");
      const updateWithDate = {
        id: 1,
        date: newDate,
      };

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      mockDonationsData.updateDonation.mockResolvedValue({
        ...mockDonation,
        date: newDate,
      });

      const result = await caller.update(updateWithDate);

      expect(result.date).toEqual(newDate);
    });
  });

  describe("delete", () => {
    it("should delete a donation", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      mockDonationsData.deleteDonation.mockResolvedValue(undefined);

      await expect(caller.delete({ id: 1 })).resolves.toBeUndefined();

      expect(mockDonationsData.deleteDonation).toHaveBeenCalledWith(1);
    });

    it("should throw FORBIDDEN if donation doesn't belong to organization", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue({
        ...mockDonationWithDetails,
        project: { ...mockProject, organizationId: "org-2" },
      });

      await expectTRPCError(
        caller.delete({ id: 1 }),
        "FORBIDDEN",
        "You don't have permission to access this donation"
      );
    });

    it("should handle deletion errors gracefully", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.getDonationById.mockResolvedValue(mockDonationWithDetails);
      mockDonationsData.deleteDonation.mockRejectedValue(new Error("Database error"));

      await expectTRPCError(
        caller.delete({ id: 1 }),
        "INTERNAL_SERVER_ERROR",
        "Failed to delete the donation"
      );
    });
  });

  describe("list", () => {
    const mockDonationsList = {
      donations: [
        mockDonationWithDetails,
        {
          ...mockDonationWithDetails,
          id: 2,
          amount: 25000,
        },
      ],
      totalCount: 2,
    };

    it("should list donations with default parameters", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.listDonations.mockResolvedValue(mockDonationsList);

      const result = await caller.list({});

      expect(result).toEqual(mockDonationsList);
      expect(mockDonationsData.listDonations).toHaveBeenCalledWith({}, "org-1");
    });

    it("should filter by donor", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const filteredList = {
        donations: [mockDonationWithDetails],
        totalCount: 1,
      };

      mockDonationsData.listDonations.mockResolvedValue(filteredList);

      const result = await caller.list({ donorId: 123 });

      expect(result.donations).toHaveLength(1);
      expect(mockDonationsData.listDonations).toHaveBeenCalledWith(
        { donorId: 123 },
        "org-1"
      );
    });

    it("should filter by project", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.listDonations.mockResolvedValue(mockDonationsList);

      await caller.list({ projectId: 456 });

      expect(mockDonationsData.listDonations).toHaveBeenCalledWith(
        { projectId: 456 },
        "org-1"
      );
    });

    it("should filter by date range", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");

      mockDonationsData.listDonations.mockResolvedValue(mockDonationsList);

      await caller.list({ startDate, endDate });

      expect(mockDonationsData.listDonations).toHaveBeenCalledWith(
        { startDate, endDate },
        "org-1"
      );
    });

    it("should support pagination", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.listDonations.mockResolvedValue({
        donations: [mockDonationWithDetails],
        totalCount: 10,
      });

      await caller.list({ limit: 5, offset: 5 });

      expect(mockDonationsData.listDonations).toHaveBeenCalledWith(
        { limit: 5, offset: 5 },
        "org-1"
      );
    });

    it("should support ordering", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonationsData.listDonations.mockResolvedValue(mockDonationsList);

      await caller.list({
        orderBy: "amount",
        orderDirection: "desc",
      });

      expect(mockDonationsData.listDonations).toHaveBeenCalledWith(
        { orderBy: "amount", orderDirection: "desc" },
        "org-1"
      );
    });

    it("should validate pagination limits", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      await expect(caller.list({ limit: 101 })).rejects.toThrow();
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
      await expect(caller.list({ offset: -1 })).rejects.toThrow();
    });
  });

  describe("getDonorStats", () => {
    const mockStats = {
      totalAmount: 150000, // $1,500.00
      donationCount: 5,
      averageAmount: 30000, // $300.00
      firstDonationDate: new Date("2023-01-01"),
      lastDonationDate: new Date("2024-01-15"),
    };

    it("should fetch donation statistics for a donor", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(mockDonor);
      mockDonationsData.getDonorDonationStats.mockResolvedValue(mockStats);

      const result = await caller.getDonorStats({ donorId: 123 });

      expect(result).toEqual(mockStats);
      expect(mockDonorsData.getDonorById).toHaveBeenCalledWith(123, "org-1");
      expect(mockDonationsData.getDonorDonationStats).toHaveBeenCalledWith(123, "org-1");
    });

    it("should throw NOT_FOUND if donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorById.mockResolvedValue(null);

      await expectTRPCError(
        caller.getDonorStats({ donorId: 999 }),
        "NOT_FOUND",
        "The selected donor doesn't exist in your organization"
      );
    });
  });

  describe("getMultipleDonorStats", () => {
    const mockMultipleStats = {
      123: {
        totalAmount: 150000,
        donationCount: 5,
        averageAmount: 30000,
      },
      124: {
        totalAmount: 75000,
        donationCount: 3,
        averageAmount: 25000,
      },
    };

    it("should fetch statistics for multiple donors", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      const donor1 = { ...mockDonor, id: 123 };
      const donor2 = { ...mockDonor, id: 124 };

      mockDonorsData.getDonorsByIds.mockResolvedValue([donor1, donor2]);
      
      mockDonationsData.getMultipleDonorDonationStats.mockResolvedValue(mockMultipleStats);

      const result = await caller.getMultipleDonorStats({ donorIds: [123, 124] });

      expect(result).toEqual(mockMultipleStats);
      expect(mockDonorsData.getDonorsByIds).toHaveBeenCalledWith([123, 124], "org-1");
      expect(mockDonationsData.getMultipleDonorDonationStats).toHaveBeenCalledWith(
        [123, 124],
        "org-1"
      );
    });

    it("should throw NOT_FOUND if any donor doesn't exist", async () => {
      const ctx = createProtectedTestContext();
      const caller = donationsRouter.createCaller(ctx);

      mockDonorsData.getDonorsByIds.mockResolvedValue([mockDonor]); // Only returns one donor, not two

      await expectTRPCError(
        caller.getMultipleDonorStats({ donorIds: [123, 999] }),
        "NOT_FOUND",
        "Donors not found in your organization"
      );
    });
  });
});