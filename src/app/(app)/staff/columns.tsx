import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

export type Staff = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
};

export const columns: ColumnDef<Staff>[] = [
  {
    id: "name",
    header: ({ column }: { column: Column<Staff> }) => {
      return (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }: { row: Row<Staff> }) => (
      <Link href={`/staff/${row.original.id}`} className="font-medium">
        {row.original.firstName} {row.original.lastName}
      </Link>
    ),
    accessorFn: (row: Staff) => `${row.firstName} ${row.lastName}`,
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Staff> }) => (
      <div
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.original.isRealPerson ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}
      >
        {row.original.isRealPerson ? "Active" : "Inactive"}
      </div>
    ),
    accessorFn: (row: Staff) => (row.isRealPerson ? "Active" : "Inactive"),
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    cell: ({ row }: { row: Row<Staff> }) => {
      const date = new Date(row.getValue("createdAt"));
      return date.toLocaleDateString();
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Staff> }) => (
      <div className="flex items-center justify-end gap-2">
        <Link href={`/communications/staff/${row.original.id}`}>
          <Button variant="ghost" size="sm">
            Communications
          </Button>
        </Link>
      </div>
    ),
  },
];
