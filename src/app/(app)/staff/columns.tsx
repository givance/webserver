import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2, Mail, MailX, FileText, Link2, User, MessageSquare } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useStaff } from "@/app/hooks/use-staff";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal } from "lucide-react";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

export type Staff = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
  signature?: string | null;
  gmailToken?: {
    id: number;
    email: string;
  } | null;
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
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the staff member and all associated data.
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

// Simple Gmail Connect Button
function SimpleGmailConnectButton({ staffId }: { staffId: string | number }) {
  const staffGmailAuthMutation = trpc.staffGmail.getStaffGmailAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error("Could not get Gmail authentication URL. Please try again.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initiate Gmail connection. Please try again.");
    },
  });

  const handleConnect = () => {
    staffGmailAuthMutation.mutate({ staffId: Number(staffId) });
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={staffGmailAuthMutation.isPending}
      variant="outline"
      size="sm"
      className="h-6 text-xs"
    >
      {staffGmailAuthMutation.isPending ? "..." : "Link"}
    </Button>
  );
}

// HoverDisconnectButton component for the Gmail column
function HoverDisconnectButton({ staffId, email }: { staffId: string | number; email: string }) {
  const [open, setOpen] = useState(false);
  const { disconnectStaffGmail, isDisconnecting } = useStaff();

  const handleDisconnect = async () => {
    await disconnectStaffGmail(Number(staffId));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <div className="group relative">
            <Badge
              variant="default"
              className="bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 transition-all duration-200 cursor-pointer group-hover:bg-red-100 group-hover:text-red-700"
            >
              <Mail className="h-3 w-3 mr-1 group-hover:hidden" />
              <MailX className="h-3 w-3 mr-1 hidden group-hover:block" />
              <span className="group-hover:hidden">Connected</span>
              <span className="hidden group-hover:block">Disconnect</span>
            </Badge>
          </div>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the Gmail account "{email}" from this staff member. They will no longer be able to
              send emails through their connected account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
              disabled={isDisconnecting}
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="text-xs text-slate-500">{email}</div>
    </div>
  );
}

// GmailDisconnectButton component for dropdown use
function GmailDisconnectButton({ staffId }: { staffId: string | number }) {
  const [open, setOpen] = useState(false);
  const { disconnectStaffGmail, isDisconnecting } = useStaff();

  const handleDisconnect = async () => {
    await disconnectStaffGmail(Number(staffId));
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <MailX className="h-4 w-4 mr-2" />
          Disconnect Gmail
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Gmail Account</AlertDialogTitle>
          <AlertDialogDescription>
            This will disconnect the Gmail account from this staff member. They will no longer be able to send emails
            through their connected account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDisconnect}
            className="bg-orange-500 hover:bg-orange-700 focus:ring-orange-500"
            disabled={isDisconnecting}
          >
            {isDisconnecting ? "Disconnecting..." : "Disconnect"}
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
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100">
          <User className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <Link
            href={`/staff/${row.original.id}`}
            className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
          >
            {row.original.firstName} {row.original.lastName}
          </Link>
          <div className="text-sm text-slate-500">{row.original.email}</div>
        </div>
      </div>
    ),
    accessorFn: (row: Staff) => `${row.firstName} ${row.lastName}`,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Staff> }) => (
      <Badge variant={row.original.isRealPerson ? "default" : "secondary"}>
        {row.original.isRealPerson ? "Active" : "Inactive"}
      </Badge>
    ),
    accessorFn: (row: Staff) => (row.isRealPerson ? "Active" : "Inactive"),
  },
  {
    id: "gmailAccount",
    header: "Gmail",
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasLinkedAccount = row.original.gmailToken !== null;

      if (hasLinkedAccount && row.original.gmailToken?.email) {
        return <HoverDisconnectButton staffId={row.original.id} email={row.original.gmailToken.email} />;
      }

      return <SimpleGmailConnectButton staffId={row.original.id} />;
    },
    accessorFn: (row: Staff) => (row.gmailToken ? "Connected" : "Not connected"),
  },
  {
    id: "signature",
    header: "Signature",
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasSignature = row.original.signature && row.original.signature.trim().length > 0;
      return (
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full ${
              hasSignature ? "bg-blue-100" : "bg-slate-100"
            }`}
          >
            <FileText className={`h-3 w-3 ${hasSignature ? "text-blue-600" : "text-slate-400"}`} />
          </div>
          <span className={`text-sm ${hasSignature ? "text-blue-700" : "text-slate-500"}`}>
            {hasSignature ? "Set" : "Not set"}
          </span>
        </div>
      );
    },
    accessorFn: (row: Staff) => (row.signature ? "Set" : "Not set"),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }: { row: Row<Staff> }) => {
      const date = new Date(row.getValue("createdAt"));
      return <div className="text-sm text-slate-600">{date.toLocaleDateString()}</div>;
    },
  },
  {
    id: "actions",
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasLinkedAccount = row.original.gmailToken !== null;

      return (
        <div className="flex items-center gap-2">
          <Link href={`/communications?staffId=${row.original.id}`}>
            <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
              <MessageSquare className="h-4 w-4 mr-1" />
              Communications
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/staff/${row.original.id}`} className="flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  View Details
                </Link>
              </DropdownMenuItem>
              {hasLinkedAccount && (
                <>
                  <DropdownMenuSeparator />
                  <GmailDisconnectButton staffId={row.original.id} />
                </>
              )}
              <DropdownMenuSeparator />
              <DeleteStaffButton staffId={row.original.id} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
