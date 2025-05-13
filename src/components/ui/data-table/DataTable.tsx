import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState,
  Header,
  HeaderGroup,
  Row,
  Cell,
  PaginationState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  totalItems?: number;
  pageSize?: number;
  pageCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
  totalItems,
  pageSize,
  pageCount,
  currentPage,
  onPageChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const isServerSidePagination =
    totalItems !== undefined &&
    pageSize !== undefined &&
    pageCount !== undefined &&
    currentPage !== undefined &&
    onPageChange !== undefined;

  const pagination = React.useMemo<PaginationState | undefined>(() => {
    if (isServerSidePagination) {
      return {
        pageIndex: currentPage - 1,
        pageSize: pageSize,
      };
    }
    return undefined;
  }, [isServerSidePagination, currentPage, pageSize]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: !isServerSidePagination ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: isServerSidePagination,
    pageCount: isServerSidePagination ? pageCount : undefined,
    state: {
      sorting,
      columnFilters,
      pagination: pagination,
    },
  });

  const handlePreviousPage = () => {
    if (isServerSidePagination && currentPage > 1) {
      onPageChange(currentPage - 1);
    } else if (!isServerSidePagination) {
      table.previousPage();
    }
  };

  const handleNextPage = () => {
    if (isServerSidePagination && currentPage < pageCount) {
      onPageChange(currentPage + 1);
    } else if (!isServerSidePagination) {
      table.nextPage();
    }
  };

  const handleGoToPage = (page: number) => {
    if (isServerSidePagination) {
      onPageChange(page);
    } else {
      table.setPageIndex(page - 1);
    }
  };

  const getCanPreviousPage = () => {
    if (isServerSidePagination) {
      return currentPage > 1;
    }
    return table.getCanPreviousPage();
  };

  const getCanNextPage = () => {
    if (isServerSidePagination) {
      return currentPage < pageCount;
    }
    return table.getCanNextPage();
  };

  const renderPageNumbers = () => {
    if (!isServerSidePagination || !pageCount || pageCount <= 1) return null;

    const pageNumbers = [];
    const maxPagesToShow = 5;
    const ellipsis = <span className="px-2 py-1">...</span>;

    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(pageCount, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
      pageNumbers.push(
        <Button
          key={1}
          variant="outline"
          size="sm"
          onClick={() => handleGoToPage(1)}
          className={currentPage === 1 ? "font-bold" : ""}
        >
          1
        </Button>
      );
      if (startPage > 2) {
        pageNumbers.push(React.cloneElement(ellipsis, { key: "start-ellipsis" }));
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <Button
          key={i}
          variant="outline"
          size="sm"
          onClick={() => handleGoToPage(i)}
          className={currentPage === i ? "font-bold bg-muted" : ""}
        >
          {i}
        </Button>
      );
    }

    if (endPage < pageCount) {
      if (endPage < pageCount - 1) {
        pageNumbers.push(React.cloneElement(ellipsis, { key: "end-ellipsis" }));
      }
      pageNumbers.push(
        <Button
          key={pageCount}
          variant="outline"
          size="sm"
          onClick={() => handleGoToPage(pageCount)}
          className={currentPage === pageCount ? "font-bold" : ""}
        >
          {pageCount}
        </Button>
      );
    }
    return pageNumbers;
  };

  return (
    <div>
      {searchKey && (
        <div className="flex items-center py-4">
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn(searchKey)?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header: Header<TData, unknown>) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row: Row<TData>) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell: Cell<TData, unknown>) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        {isServerSidePagination && totalItems !== undefined && pageSize !== undefined && (
          <div className="text-sm text-muted-foreground">
            Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)}
            {" - "}
            {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
          </div>
        )}
        {!isServerSidePagination && table.getFilteredRowModel().rows.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} row(s). Selected {table.getFilteredSelectedRowModel().rows.length}{" "}
            row(s).
          </div>
        )}

        <div className="flex items-center space-x-2">
          {isServerSidePagination && pageCount && pageCount > 1 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleGoToPage(1)} disabled={!getCanPreviousPage()}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={!getCanPreviousPage()}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            </>
          )}
          {!isServerSidePagination && (
            <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={!getCanPreviousPage()}>
              Previous
            </Button>
          )}

          {renderPageNumbers()}

          {isServerSidePagination && pageCount && pageCount > 1 && (
            <>
              <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!getCanNextPage()}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGoToPage(pageCount)}
                disabled={!getCanNextPage()}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {!isServerSidePagination && (
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!getCanNextPage()}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
