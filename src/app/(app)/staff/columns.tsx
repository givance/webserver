import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2, Mail, MailX, FileText } from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useStaff } from "@/app/hooks/use-staff";

export type Staff = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
  signature?: string | null;
  linkedGmailTokenId?: number | null;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
};

// DeleteStaffButton component to handle delete with confirmation dialog
function DeleteStaffButton({ staffId }: { staffId: string | number }) {
  const [open, setOpen] = useState(false);
  const { deleteStaff, isDeleting } = useStaff();

  const handleDelete = async () => {
    await deleteStaff(Number(staffId));
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the staff member.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
      <Link href={`/staff/${row.original.id}`} className="font-medium hover:underline">
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
    id: "emailAccount",
    header: "Email Account",
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasLinkedAccount = row.original.linkedGmailTokenId !== null;
      return (
        <div className="flex items-center gap-2">
          {hasLinkedAccount ? (
            <>
              <Mail className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">Connected</span>
            </>
          ) : (
            <>
              <MailX className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Not connected</span>
            </>
          )}
        </div>
      );
    },
    accessorFn: (row: Staff) => (row.linkedGmailTokenId ? "Connected" : "Not connected"),
  },
  {
    id: "signature",
    header: "Signature",
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasSignature = row.original.signature && row.original.signature.trim().length > 0;
      return (
        <div className="flex items-center gap-2">
          {hasSignature ? (
            <>
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-600">Set</span>
            </>
          ) : (
            <>
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Not set</span>
            </>
          )}
        </div>
      );
    },
    accessorFn: (row: Staff) => (row.signature ? "Set" : "Not set"),
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
        <Link href={`/communications?staffId=${row.original.id}`}>
          <Button variant="ghost" size="sm">
            Communications
          </Button>
        </Link>
        <DeleteStaffButton staffId={row.original.id} />
      </div>
    ),
  },
];
