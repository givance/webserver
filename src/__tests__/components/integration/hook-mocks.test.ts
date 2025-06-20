describe("Hook Mocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useDonors hook mock", () => {
    it("should be mocked", () => {
      const { useDonors } = require("@/app/hooks/use-donors");
      expect(typeof useDonors).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = useDonors();
      expect(result).toHaveProperty("listDonors");
      expect(result).toHaveProperty("createDonor");
      expect(result).toHaveProperty("updateDonor");
      expect(result).toHaveProperty("deleteDonor");
    });
  });

  describe("useProjects hook mock", () => {
    it("should be mocked", () => {
      const { useProjects } = require("@/app/hooks/use-projects");
      expect(typeof useProjects).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = useProjects();
      expect(result).toHaveProperty("listProjects");
      expect(result).toHaveProperty("createProject");
      expect(result).toHaveProperty("updateProject");
      expect(result).toHaveProperty("deleteProject");
    });
  });

  describe("useCommunications hook mock", () => {
    it("should be mocked", () => {
      const { useCommunications } = require("@/app/hooks/use-communications");
      expect(typeof useCommunications).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = useCommunications();
      expect(result).toHaveProperty("getSession");
    });
  });

  describe("useSearch hook mock", () => {
    it("should be mocked", () => {
      const { useSearch } = require("@/app/hooks/use-search");
      expect(typeof useSearch).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = useSearch();
      expect(result).toHaveProperty("searchTerm");
      expect(result).toHaveProperty("debouncedSearchTerm");
      expect(result).toHaveProperty("setSearchTerm");
      expect(result).toHaveProperty("clearSearch");
    });
  });

  describe("usePagination hook mock", () => {
    it("should be mocked", () => {
      const { usePagination } = require("@/app/hooks/use-pagination");
      expect(typeof usePagination).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = usePagination();
      expect(result).toHaveProperty("currentPage");
      expect(result).toHaveProperty("pageSize");
      expect(result).toHaveProperty("setCurrentPage");
      expect(result).toHaveProperty("setPageSize");
      expect(result).toHaveProperty("getOffset");
      expect(result).toHaveProperty("getPageCount");
      expect(result).toHaveProperty("resetToFirstPage");
    });
  });

  describe("navigation mocks", () => {
    it("should have mocked router", () => {
      const { useRouter } = require("next/navigation");
      const router = useRouter();

      expect(router).toHaveProperty("push");
      expect(router).toHaveProperty("back");
      expect(router).toHaveProperty("forward");
      expect(router).toHaveProperty("refresh");
      expect(typeof router.push).toBe("function");
    });

    it("should have mocked useParams", () => {
      const navigation = require("next/navigation");
      expect(navigation).toHaveProperty("useParams");
      expect(typeof navigation.useParams).toBe("function");
    });

    it("should have mocked useSearchParams", () => {
      const { useSearchParams } = require("next/navigation");
      const searchParams = useSearchParams();
      expect(searchParams).toHaveProperty("get");
      expect(typeof searchParams.get).toBe("function");
    });
  });

  describe("toast mocks", () => {
    it("should have mocked react-hot-toast", () => {
      const { toast } = require("react-hot-toast");
      
      expect(toast).toHaveProperty("success");
      expect(toast).toHaveProperty("error");
      expect(toast).toHaveProperty("loading");
      expect(typeof toast.success).toBe("function");
    });

    it("should have mocked sonner", () => {
      const { toast } = require("sonner");
      
      expect(toast).toHaveProperty("success");
      expect(toast).toHaveProperty("error");
      expect(toast).toHaveProperty("loading");
      expect(toast).toHaveProperty("promise");
      expect(typeof toast.success).toBe("function");
    });
  });
});