import { useState } from "react";
import { useDebounce } from "use-debounce";

interface UseSearchProps {
  debounceMs?: number;
  initialValue?: string;
}

interface UseSearchReturn {
  searchTerm: string;
  debouncedSearchTerm: string;
  setSearchTerm: (term: string) => void;
  clearSearch: () => void;
}

/**
 * Custom hook for managing search state with debouncing
 * @param debounceMs - Debounce delay in milliseconds (defaults to 500)
 * @param initialValue - Initial search term value
 * @returns Search state and helper functions
 */
export function useSearch({ debounceMs = 500, initialValue = "" }: UseSearchProps = {}): UseSearchReturn {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const [debouncedSearchTerm] = useDebounce(searchTerm, debounceMs);

  const clearSearch = () => {
    setSearchTerm("");
  };

  return {
    searchTerm,
    debouncedSearchTerm,
    setSearchTerm,
    clearSearch,
  };
}
