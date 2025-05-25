import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/app/hooks/use-pagination";

interface PageSizeSelectorProps {
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  className?: string;
}

/**
 * Reusable page size selector component
 * @param pageSize - Current page size value
 * @param onPageSizeChange - Callback when page size changes
 * @param className - Additional CSS classes
 */
export function PageSizeSelector({ pageSize, onPageSizeChange, className }: PageSizeSelectorProps) {
  return (
    <Select value={pageSize.toString()} onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}>
      <SelectTrigger className={`w-[180px] ${className || ""}`}>
        <SelectValue placeholder="Select page size" />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map((size) => (
          <SelectItem key={size} value={size.toString()}>
            {size} items per page
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
