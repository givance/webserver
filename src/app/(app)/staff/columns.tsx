import { ColumnDef, Column, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2, Mail, MailX, FileText, Link2, User, MessageSquare, Edit2, Save, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { SignatureEditor, SignaturePreview } from "@/components/signature";
import { sanitizeHtml } from "@/app/lib/utils/sanitize-html";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { useStaff } from "@/app/hooks/use-staff";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal } from "lucide-react";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export type Staff = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
  isPrimary: boolean;
  signature?: string | null;
  gmailToken?: {
    id: number;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  organizationId: string;
};

// PrimaryStaffToggle component to handle setting/unsetting primary status
function PrimaryStaffToggle({
  staffId,
  isPrimary,
  hasGmailToken,
}: {
  staffId: string | number;
  isPrimary: boolean;
  hasGmailToken: boolean;
}) {
  const utils = trpc.useUtils();

  const setPrimaryMutation = trpc.staff.setPrimary.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      toast.success("Staff member set as primary");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to set as primary");
    },
  });

  const unsetPrimaryMutation = trpc.staff.unsetPrimary.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      toast.success("Primary status removed");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove primary status");
    },
  });

  const handleToggle = async (checked: boolean) => {
    if (checked && !hasGmailToken) {
      toast.error("Only staff members with connected Gmail accounts can be set as primary");
      return;
    }

    if (checked) {
      await setPrimaryMutation.mutateAsync({ id: Number(staffId) });
    } else {
      await unsetPrimaryMutation.mutateAsync({ id: Number(staffId) });
    }
  };

  const isLoading = setPrimaryMutation.isPending || unsetPrimaryMutation.isPending;
  const isDisabled = isLoading || (!isPrimary && !hasGmailToken);

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isPrimary}
        onCheckedChange={handleToggle}
        disabled={isDisabled}
        className="data-[state=checked]:bg-blue-600"
      />
      {isPrimary && (
        <Badge variant="default" className="bg-blue-100 text-blue-700">
          Primary
        </Badge>
      )}
      {!hasGmailToken && !isPrimary && <span className="text-xs text-gray-500">Gmail required</span>}
    </div>
  );
}

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
    <Badge
      onClick={handleConnect}
      className="bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all duration-200 cursor-pointer"
      variant="default"
    >
      {staffGmailAuthMutation.isPending ? (
        <>
          <div className="h-3 w-3 mr-1 animate-spin rounded-full border border-blue-700 border-r-transparent" />
          Connecting...
        </>
      ) : (
        <>
          <Link2 className="h-3 w-3 mr-1" />
          Link Gmail
        </>
      )}
    </Badge>
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
              This will disconnect the Gmail account &quot;{email}&quot; from this staff member. They will no longer be
              able to send emails through their connected account.
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

// SignatureEditModal component for inline signature editing
function SignatureEditModal({
  staffId,
  currentSignature,
  staffName,
}: {
  staffId: string | number;
  currentSignature?: string | null;
  staffName: string;
}) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(currentSignature || "");
  const [showCodeView, setShowCodeView] = useState(false);
  const utils = trpc.useUtils();

  const updateSignatureMutation = trpc.staff.updateSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature updated successfully");
      setOpen(false);
      // Invalidate the staff list to refresh the UI
      utils.staff.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update signature");
    },
  });

  const handleSave = async () => {
    // Sanitize HTML before saving
    const sanitizedSignature = signature ? sanitizeHtml(signature) : "";
    
    await updateSignatureMutation.mutateAsync({
      id: Number(staffId),
      signature: sanitizedSignature || undefined,
    });
  };

  const handleCancel = () => {
    setSignature(currentSignature || "");
    setShowCodeView(false);
    setOpen(false);
  };

  // Reset signature when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSignature(currentSignature || "");
      setShowCodeView(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          <Edit2 className="h-3 w-3 mr-1" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="!max-w-[1400px] w-[90vw] sm:!max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>Edit Email Signature</DialogTitle>
          <DialogDescription>
            Update the email signature for {staffName}. This signature will be automatically included in emails sent on
            their behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6 mt-4">
          <div className="space-y-4">
            <SignatureEditor
              value={signature}
              onChange={setSignature}
              showCodeView={showCodeView}
              onCodeViewChange={setShowCodeView}
            />
          </div>
          <div>
            <SignaturePreview 
              signature={signature}
              staffName={staffName}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateSignatureMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateSignatureMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// SignatureEditMenuItem component for dropdown menu use
function SignatureEditMenuItem({
  staffId,
  currentSignature,
  staffName,
}: {
  staffId: string | number;
  currentSignature?: string | null;
  staffName: string;
}) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(currentSignature || "");
  const [showCodeView, setShowCodeView] = useState(false);
  const utils = trpc.useUtils();

  const updateSignatureMutation = trpc.staff.updateSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature updated successfully");
      setOpen(false);
      // Invalidate the staff list to refresh the UI
      utils.staff.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update signature");
    },
  });

  const handleSave = async () => {
    // Sanitize HTML before saving
    const sanitizedSignature = signature ? sanitizeHtml(signature) : "";
    
    await updateSignatureMutation.mutateAsync({
      id: Number(staffId),
      signature: sanitizedSignature || undefined,
    });
  };

  const handleCancel = () => {
    setSignature(currentSignature || "");
    setShowCodeView(false);
    setOpen(false);
  };

  // Reset signature when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSignature(currentSignature || "");
      setShowCodeView(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <FileText className="h-4 w-4 mr-2" />
          Edit Signature
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="!max-w-[1400px] w-[90vw] sm:!max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>Edit Email Signature</DialogTitle>
          <DialogDescription>
            Update the email signature for {staffName}. This signature will be automatically included in emails sent on
            their behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6 mt-4">
          <div className="space-y-4">
            <SignatureEditor
              value={signature}
              onChange={setSignature}
              showCodeView={showCodeView}
              onCodeViewChange={setShowCodeView}
            />
          </div>
          <div>
            <SignaturePreview 
              signature={signature}
              staffName={staffName}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateSignatureMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateSignatureMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// SignatureDisplay component to show HTML signatures
function SignatureDisplay({ signature }: { signature: string }) {
  const [sanitizedHtml, setSanitizedHtml] = useState("");
  const [isHtml, setIsHtml] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && signature) {
      // Check if signature contains HTML tags
      const hasHtmlTags = /<[^>]+>/.test(signature);
      setIsHtml(hasHtmlTags);
      
      if (hasHtmlTags) {
        const config = {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img', 
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'span', 'div'
          ],
          ALLOWED_ATTR: [
            'href', 'src', 'alt', 'title', 'width', 'height', 
            'target', 'rel', 'class', 'style'
          ],
          ALLOWED_PROTOCOLS: ['http', 'https', 'mailto', 'tel'],
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        };

        const clean = DOMPurify.sanitize(signature, config);
        setSanitizedHtml(clean);
      }
    }
  }, [signature]);

  // For plain text signatures or if no HTML detected
  if (!isHtml) {
    return (
      <div className="text-xs text-slate-400 max-w-xs truncate">
        {signature?.slice(0, 50)}
        {signature && signature.length > 50 ? "..." : ""}
      </div>
    );
  }

  // For HTML signatures
  return (
    <div 
      className={cn(
        "text-xs text-slate-400 max-w-xs overflow-hidden",
        "prose prose-xs max-w-none",
        "prose-p:m-0 prose-p:leading-normal",
        "prose-headings:m-0 prose-headings:text-xs",
        "[&_*]:text-xs [&_*]:text-slate-400",
        "[&_a]:text-slate-500 [&_a]:no-underline",
        "[&_img]:hidden", // Hide images in the table view
        "[&_br]:hidden", // Hide line breaks to save space
        "line-clamp-2" // Limit to 2 lines
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
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
    id: "primary",
    header: "Primary",
    cell: ({ row }: { row: Row<Staff> }) => (
      <PrimaryStaffToggle
        staffId={row.original.id}
        isPrimary={row.original.isPrimary}
        hasGmailToken={!!row.original.gmailToken}
      />
    ),
    accessorFn: (row: Staff) => (row.isPrimary ? "Primary" : "Not primary"),
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
      const staffName = `${row.original.firstName} ${row.original.lastName}`;

      return (
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full ${
              hasSignature ? "bg-blue-100" : "bg-slate-100"
            }`}
          >
            <FileText className={`h-3 w-3 ${hasSignature ? "text-blue-600" : "text-slate-400"}`} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${hasSignature ? "text-blue-700" : "text-slate-500"}`}>
                {hasSignature ? "Set" : "Not set"}
              </span>
              <SignatureEditModal
                staffId={row.original.id}
                currentSignature={row.original.signature}
                staffName={staffName}
              />
            </div>
            {hasSignature && (
              <SignatureDisplay signature={row.original.signature || ""} />
            )}
          </div>
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
              <SignatureEditMenuItem
                staffId={row.original.id}
                currentSignature={row.original.signature}
                staffName={`${row.original.firstName} ${row.original.lastName}`}
              />
              <DropdownMenuSeparator />
              <DeleteStaffButton staffId={row.original.id} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
