'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/ui/data-table/DataTable';
import { getColumns, type Staff } from './columns';
import { useStaff } from '@/app/hooks/use-staff';
import { usePagination } from '@/app/hooks/use-pagination';
import { useSearch } from '@/app/hooks/use-search';
import { LoadingSkeleton } from '@/app/components/LoadingSkeleton';
import { ErrorDisplay } from '@/app/components/ErrorDisplay';
import { PageSizeSelector } from '@/app/components/PageSizeSelector';

export default function StaffListPage() {
  const { searchTerm, debouncedSearchTerm, setSearchTerm } = useSearch();
  const { currentPage, pageSize, setCurrentPage, setPageSize, getOffset, getPageCount } =
    usePagination({
      resetOnDependency: debouncedSearchTerm,
    });

  const {
    listStaff,
    refreshStaff,
    setPrimary,
    unsetPrimary,
    isSettingPrimary,
    isUnsettingPrimary,
    deleteStaff,
    isDeleting,
    disconnectStaffGmail,
    disconnectStaffMicrosoft,
    isDisconnecting,
    updateSignature,
    isUpdatingSignature,
    updateStaff,
  } = useStaff();

  const {
    data: listStaffResponse,
    isLoading,
    error,
  } = listStaff({
    limit: pageSize,
    offset: getOffset(),
    searchTerm: debouncedSearchTerm,
  });

  const { staffMembers, totalCount } = useMemo(() => {
    const items: Staff[] =
      listStaffResponse?.staff?.map((apiStaff) => ({
        id: apiStaff.id.toString(),
        firstName: apiStaff.firstName,
        lastName: apiStaff.lastName,
        email: apiStaff.email,
        isRealPerson: apiStaff.isRealPerson,
        isPrimary: apiStaff.isPrimary,
        signature: apiStaff.signature || null,
        writingInstructions: apiStaff.writingInstructions || null,
        gmailToken: apiStaff.gmailToken || null,
        microsoftToken: apiStaff.microsoftToken || null,
        createdAt: apiStaff.createdAt
          ? new Date(apiStaff.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: apiStaff.updatedAt
          ? new Date(apiStaff.updatedAt).toISOString()
          : new Date().toISOString(),
        organizationId: apiStaff.organizationId,
        integrations: apiStaff.integrations || [],
      })) || [];
    return { staffMembers: items, totalCount: listStaffResponse?.totalCount || 0 };
  }, [listStaffResponse]);

  if (error) {
    return <ErrorDisplay error={error.message || 'Unknown error'} title="Error loading staff" />;
  }

  const pageCount = getPageCount(totalCount);

  return (
    <>
      <title>Staff Management</title>
      <div className="container mx-auto px-6 py-6">
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <PageSizeSelector pageSize={pageSize} onPageSizeChange={setPageSize} />
        </div>

        {isLoading && !listStaffResponse ? (
          <LoadingSkeleton />
        ) : (
          <DataTable
            columns={getColumns({
              refreshStaff,
              setPrimary,
              unsetPrimary,
              isSettingPrimary,
              isUnsettingPrimary,
              deleteStaff,
              isDeleting,
              disconnectStaffGmail,
              disconnectStaffMicrosoft,
              isDisconnecting,
              updateSignature,
              isUpdatingSignature,
              updateStaff,
            })}
            data={staffMembers}
            searchPlaceholder="Search staff..."
            totalItems={totalCount}
            pageSize={pageSize}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </>
  );
}
