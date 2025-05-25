import { useState, useEffect } from "react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface UsePaginationProps {
  defaultPageSize?: PageSize;
  resetOnDependency?: any;
}

interface UsePaginationReturn {
  currentPage: number;
  pageSize: PageSize;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  resetToFirstPage: () => void;
  getOffset: () => number;
  getPageCount: (totalCount: number) => number;
}

/**
 * Custom hook for managing pagination state
 * @param defaultPageSize - Initial page size (defaults to DEFAULT_PAGE_SIZE)
 * @param resetOnDependency - When this value changes, pagination resets to page 1
 * @returns Pagination state and helper functions
 */
export function usePagination({
  defaultPageSize = DEFAULT_PAGE_SIZE,
  resetOnDependency,
}: UsePaginationProps = {}): UsePaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(defaultPageSize);

  // Reset to first page when dependency changes (e.g., search term)
  useEffect(() => {
    if (resetOnDependency !== undefined) {
      setCurrentPage(1);
    }
  }, [resetOnDependency]);

  const resetToFirstPage = () => {
    setCurrentPage(1);
  };

  const getOffset = () => {
    return (currentPage - 1) * pageSize;
  };

  const getPageCount = (totalCount: number) => {
    return Math.ceil(totalCount / pageSize);
  };

  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  return {
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize: handlePageSizeChange,
    resetToFirstPage,
    getOffset,
    getPageCount,
  };
}
