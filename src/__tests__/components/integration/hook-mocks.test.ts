import { useDonors } from "@/app/hooks/use-donors";
import { useProjects } from "@/app/hooks/use-projects";
import { useCommunications } from "@/app/hooks/use-communications";
import { useSearch } from "@/app/hooks/use-search";
import { usePagination } from "@/app/hooks/use-pagination";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { toast as reactHotToast } from "react-hot-toast";
import { toast as sonnerToast } from "sonner";

describe("Hook Mocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useDonors hook mock", () => {
    it("should be mocked", () => {
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
      expect(typeof useCommunications).toBe("function");
      // The hook is mocked in setup.ts to return expected shape
      const result = useCommunications();
      expect(result).toHaveProperty("getSession");
    });
  });

  describe("useSearch hook mock", () => {
    it("should be mocked", () => {
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
      const router = useRouter();

      expect(router).toHaveProperty("push");
      expect(router).toHaveProperty("back");
      expect(router).toHaveProperty("forward");
      expect(router).toHaveProperty("refresh");
      expect(typeof router.push).toBe("function");
    });

    it("should have mocked useParams", () => {
      expect(typeof useParams).toBe("function");
    });

    it("should have mocked useSearchParams", () => {
      const searchParams = useSearchParams();
      expect(searchParams).toHaveProperty("get");
      expect(typeof searchParams.get).toBe("function");
    });
  });

  describe("toast mocks", () => {
    it("should have mocked react-hot-toast", () => {
      expect(reactHotToast).toHaveProperty("success");
      expect(reactHotToast).toHaveProperty("error");
      expect(reactHotToast).toHaveProperty("loading");
      expect(typeof reactHotToast.success).toBe("function");
    });

    it("should have mocked sonner", () => {
      expect(sonnerToast).toHaveProperty("success");
      expect(sonnerToast).toHaveProperty("error");
      expect(sonnerToast).toHaveProperty("loading");
      expect(sonnerToast).toHaveProperty("promise");
      expect(typeof sonnerToast.success).toBe("function");
    });
  });
});
