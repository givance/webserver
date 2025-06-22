"use client";

import { useDonations } from "@/app/hooks/use-donations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/app/lib/utils/format";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useState, useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useDebounce } from "use-debounce";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface ProjectDonationsProps {
  projectId: number;
}

type DonationRow = {
  id: number;
  date: string;
  amount: number;
  donorId: number | null;
  donorName: string;
};

export function ProjectDonations({ projectId }: ProjectDonationsProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTermInput, 500);

  const { list: listDonations } = useDonations();
  const {
    data: listDonationsResponse,
    isLoading,
    error,
  } = listDonations({
    projectId,
    includeDonor: true,
    includeProject: true,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    orderBy: "date",
    orderDirection: "desc",
  });

  // Reset to first page when search term changes
  useEffect(() => {
    if (debouncedSearchTerm) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  const { donations, totalCount, totalAmount } = useMemo(() => {
    const donationItems = listDonationsResponse?.donations || [];
    const total = donationItems.reduce((sum, donation) => sum + donation.amount, 0);

    const formattedDonations: DonationRow[] = donationItems.map((donation) => ({
      id: donation.id,
      date: new Date(donation.date).toISOString(),
      amount: donation.amount,
      donorId: donation.donor?.id || null,
      donorName: donation.donor ? formatDonorName(donation.donor) : "Unknown Donor",
    }));

    return {
      donations: formattedDonations,
      totalCount: listDonationsResponse?.totalCount || 0,
      totalAmount: total,
    };
  }, [listDonationsResponse]);

  const pageCount = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const columns: ColumnDef<DonationRow>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => new Date(row.getValue("date")).toLocaleDateString(),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Amount
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => formatCurrency(row.getValue("amount")),
    },
    {
      accessorKey: "donorName",
      header: "Donor",
      cell: ({ row }) => {
        const donorId = row.original.donorId;
        const donorName = row.getValue("donorName") as string;
        return donorId ? (
          <Link href={`/donors/${donorId}`} className="hover:underline">
            {donorName}
          </Link>
        ) : (
          <span>{donorName}</span>
        );
      },
    },
  ];

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Donations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Error loading donations: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Project Donations</CardTitle>
          <div className="text-sm text-muted-foreground">
            Total donations: <span className="font-medium">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search donations..."
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

          {isLoading && !listDonationsResponse ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={donations}
              totalItems={totalCount}
              pageSize={pageSize}
              pageCount={pageCount}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              onPageSizeChange={(size) => {
                setPageSize(size as typeof pageSize);
                setCurrentPage(1);
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
