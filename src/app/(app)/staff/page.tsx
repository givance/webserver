"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { columns, type Staff } from "./columns";
import { useStaff } from "@/app/hooks/use-staff";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "use-debounce";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export default function StaffListPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);

  const { listStaff } = useStaff();

  const {
    data: listStaffResponse,
    isLoading,
    error,
  } = listStaff({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    searchTerm: debouncedSearchTerm,
  });

  useEffect(() => {
    if (debouncedSearchTerm) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  const { staffMembers, totalCount } = useMemo(() => {
    const items: Staff[] =
      listStaffResponse?.staff?.map((apiStaff) => ({
        id: apiStaff.id.toString(),
        firstName: apiStaff.firstName,
        lastName: apiStaff.lastName,
        email: apiStaff.email,
        isRealPerson: apiStaff.isRealPerson,
        createdAt: apiStaff.createdAt ? new Date(apiStaff.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: apiStaff.updatedAt ? new Date(apiStaff.updatedAt).toISOString() : new Date().toISOString(),
        organizationId: apiStaff.organizationId,
      })) || [];
    return { staffMembers: items, totalCount: listStaffResponse?.totalCount || 0 };
  }, [listStaffResponse]);

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-red-500">Error loading staff: {error.message}</div>
      </div>
    );
  }

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <>
      <title>Staff Management</title>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <Link href="/staff/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Staff
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <Input
            placeholder="Search staff by name, email..."
            value={searchTermInput}
            onChange={(e) => setSearchTermInput(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value) as typeof pageSize);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
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
        </div>

        {isLoading && !listStaffResponse ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={staffMembers}
            searchPlaceholder="Search staff..."
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </>
  );
}
