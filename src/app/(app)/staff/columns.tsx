import { sanitizeHtml } from '@/app/lib/utils/sanitize-html';
import { SignatureEditor, SignaturePreview } from '@/components/signature';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmailProviderConnect } from '@/components/ui/EmailProviderConnect';
import { InlineTextEdit } from '@/components/ui/inline-edit';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Column, ColumnDef, Row } from '@tanstack/react-table';
import DOMPurify from 'dompurify';
import {
  ArrowUpDown,
  Edit2,
  FileText,
  MailX,
  MessageSquare,
  MoreHorizontal,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export type Staff = {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  isRealPerson: boolean;
  isPrimary: boolean;
  signature?: string | null;
  writingInstructions?: string | null;
  gmailToken?: {
    id: number;
    email: string;
  } | null;
  microsoftToken?: {
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
  hasEmailToken,
  setPrimary,
  unsetPrimary,
  isSettingPrimary,
  isUnsettingPrimary,
}: {
  staffId: string | number;
  isPrimary: boolean;
  hasEmailToken: boolean;
  setPrimary?: (staffId: number) => Promise<any>;
  unsetPrimary?: (staffId: number) => Promise<any>;
  isSettingPrimary?: boolean;
  isUnsettingPrimary?: boolean;
}) {
  const handleToggle = async (checked: boolean) => {
    if (checked && !hasEmailToken) {
      toast.error('Only staff members with connected email accounts can be set as primary');
      return;
    }

    if (checked) {
      await setPrimary?.(Number(staffId));
    } else {
      await unsetPrimary?.(Number(staffId));
    }
  };

  const isLoading = isSettingPrimary || isUnsettingPrimary;
  const isDisabled = isLoading || (!isPrimary && !hasEmailToken);

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
      {!hasEmailToken && !isPrimary && (
        <span className="text-xs text-gray-500">Email required</span>
      )}
    </div>
  );
}

// DeleteStaffButton component to handle delete with confirmation dialog
function DeleteStaffButton({
  staffId,
  deleteStaff,
  isDeleting,
}: {
  staffId: string | number;
  deleteStaff?: (staffId: number) => Promise<any>;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    await deleteStaff?.(Number(staffId));
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
            This action cannot be undone. This will permanently delete the staff member and all
            associated data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-700 focus:ring-red-500"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// EmailDisconnectButton component for dropdown use
function EmailDisconnectButton({
  staffId,
  provider,
  disconnectStaffGmail,
  disconnectStaffMicrosoft,
  isDisconnecting,
}: {
  staffId: string | number;
  provider: 'gmail' | 'microsoft';
  disconnectStaffGmail?: (staffId: number) => Promise<any>;
  disconnectStaffMicrosoft?: (staffId: number) => Promise<any>;
  isDisconnecting?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handleDisconnect = async () => {
    if (provider === 'gmail') {
      await disconnectStaffGmail?.(Number(staffId));
    } else {
      await disconnectStaffMicrosoft?.(Number(staffId));
    }
    setOpen(false);
  };

  const providerName = provider === 'gmail' ? 'Gmail' : 'Microsoft';

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <MailX className="h-4 w-4 mr-2" />
          Disconnect {providerName}
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {providerName} Account</AlertDialogTitle>
          <AlertDialogDescription>
            This will disconnect the {providerName} account from this staff member. They will no
            longer be able to send emails through their connected account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDisconnect}
            className="bg-orange-500 hover:bg-orange-700 focus:ring-orange-500"
            disabled={isDisconnecting}
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
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
  updateSignature,
  isUpdatingSignature,
}: {
  staffId: string | number;
  currentSignature?: string | null;
  staffName: string;
  updateSignature?: (data: { id: number; signature?: string }) => Promise<any>;
  isUpdatingSignature?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(currentSignature || '');
  const [showCodeView, setShowCodeView] = useState(false);

  const handleSave = async () => {
    // Sanitize HTML before saving
    const sanitizedSignature = signature ? sanitizeHtml(signature) : '';

    await updateSignature?.({
      id: Number(staffId),
      signature: sanitizedSignature || undefined,
    });
    setOpen(false);
  };

  const handleCancel = () => {
    setSignature(currentSignature || '');
    setShowCodeView(false);
    setOpen(false);
  };

  // Reset signature when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSignature(currentSignature || '');
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
            Update the email signature for {staffName}. This signature will be automatically
            included in emails sent on their behalf.
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
            <SignaturePreview signature={signature} staffName={staffName} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdatingSignature}>
            <Save className="h-4 w-4 mr-2" />
            {isUpdatingSignature ? 'Saving...' : 'Save'}
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
  updateSignature,
  isUpdatingSignature,
}: {
  staffId: string | number;
  currentSignature?: string | null;
  staffName: string;
  updateSignature?: (data: { id: number; signature?: string }) => Promise<any>;
  isUpdatingSignature?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(currentSignature || '');
  const [showCodeView, setShowCodeView] = useState(false);

  const handleSave = async () => {
    // Sanitize HTML before saving
    const sanitizedSignature = signature ? sanitizeHtml(signature) : '';

    await updateSignature?.({
      id: Number(staffId),
      signature: sanitizedSignature || undefined,
    });
    setOpen(false);
  };

  const handleCancel = () => {
    setSignature(currentSignature || '');
    setShowCodeView(false);
    setOpen(false);
  };

  // Reset signature when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setSignature(currentSignature || '');
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
            Update the email signature for {staffName}. This signature will be automatically
            included in emails sent on their behalf.
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
            <SignaturePreview signature={signature} staffName={staffName} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdatingSignature}>
            <Save className="h-4 w-4 mr-2" />
            {isUpdatingSignature ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// EmailEditCell component for inline email editing
function EmailEditCell({
  staff,
  updateStaff,
}: {
  staff: Staff;
  updateStaff?: (data: { id: number; email: string }) => Promise<any>;
}) {
  return (
    <InlineTextEdit
      value={staff.email}
      onSave={async (value) => {
        try {
          if (!updateStaff) {
            throw new Error('Update function not available');
          }
          await updateStaff({
            id: Number(staff.id),
            email: value,
          });
          toast.success('Email updated');
        } catch (error) {
          toast.error('Failed to update email');
          throw error;
        }
      }}
      type="email"
      validation={(email) => {
        if (!email) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return 'Invalid email format';
        return null;
      }}
      className="text-sm text-slate-500"
    />
  );
}

// SignatureDisplay component to show HTML signatures
function SignatureDisplay({ signature }: { signature: string }) {
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const [isHtml, setIsHtml] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && signature) {
      // Check if signature contains HTML tags
      const hasHtmlTags = /<[^>]+>/.test(signature);
      setIsHtml(hasHtmlTags);

      if (hasHtmlTags) {
        const config = {
          ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'b',
            'em',
            'i',
            'u',
            'a',
            'img',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'blockquote',
            'span',
            'div',
          ],
          ALLOWED_ATTR: [
            'href',
            'src',
            'alt',
            'title',
            'width',
            'height',
            'target',
            'rel',
            'class',
            'style',
          ],
          ALLOWED_PROTOCOLS: ['http', 'https', 'mailto', 'tel'],
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
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
        {signature && signature.length > 50 ? '...' : ''}
      </div>
    );
  }

  // For HTML signatures
  return (
    <div
      className={cn(
        'text-xs text-slate-400 max-w-xs overflow-hidden',
        'prose prose-xs max-w-none',
        'prose-p:m-0 prose-p:leading-normal',
        'prose-headings:m-0 prose-headings:text-xs',
        '[&_*]:text-xs [&_*]:text-slate-400',
        '[&_a]:text-slate-500 [&_a]:no-underline',
        '[&_img]:hidden', // Hide images in the table view
        '[&_br]:hidden', // Hide line breaks to save space
        'line-clamp-2' // Limit to 2 lines
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

export const getColumns = (staffHooks?: {
  refreshStaff?: () => void;
  setPrimary?: (staffId: number) => Promise<any>;
  unsetPrimary?: (staffId: number) => Promise<any>;
  isSettingPrimary?: boolean;
  isUnsettingPrimary?: boolean;
  deleteStaff?: (staffId: number) => Promise<any>;
  isDeleting?: boolean;
  disconnectStaffGmail?: (staffId: number) => Promise<any>;
  disconnectStaffMicrosoft?: (staffId: number) => Promise<any>;
  isDisconnecting?: boolean;
  updateSignature?: (data: { id: number; signature?: string }) => Promise<any>;
  isUpdatingSignature?: boolean;
  updateStaff?: (data: { id: number; email: string }) => Promise<any>;
}): ColumnDef<Staff>[] => [
  {
    id: 'name',
    header: ({ column }: { column: Column<Staff> }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
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
          <EmailEditCell staff={row.original} updateStaff={staffHooks?.updateStaff} />
        </div>
      </div>
    ),
    accessorFn: (row: Staff) => `${row.firstName} ${row.lastName}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }: { row: Row<Staff> }) => (
      <Badge variant={row.original.isRealPerson ? 'default' : 'secondary'}>
        {row.original.isRealPerson ? 'Active' : 'Inactive'}
      </Badge>
    ),
    accessorFn: (row: Staff) => (row.isRealPerson ? 'Active' : 'Inactive'),
  },
  {
    id: 'primary',
    header: 'Primary',
    cell: ({ row }: { row: Row<Staff> }) => (
      <PrimaryStaffToggle
        staffId={row.original.id}
        isPrimary={row.original.isPrimary}
        hasEmailToken={!!(row.original.gmailToken || row.original.microsoftToken)}
        setPrimary={staffHooks?.setPrimary}
        unsetPrimary={staffHooks?.unsetPrimary}
        isSettingPrimary={staffHooks?.isSettingPrimary}
        isUnsettingPrimary={staffHooks?.isUnsettingPrimary}
      />
    ),
    accessorFn: (row: Staff) => (row.isPrimary ? 'Primary' : 'Not primary'),
  },
  {
    id: 'emailAccount',
    header: 'Email',
    cell: ({ row }: { row: Row<Staff> }) => {
      return (
        <EmailProviderConnect
          staffId={Number(row.original.id)}
          gmailToken={row.original.gmailToken}
          microsoftToken={row.original.microsoftToken}
          onConnectionChange={staffHooks?.refreshStaff}
          variant="inline"
        />
      );
    },
    accessorFn: (row: Staff) => {
      if (row.gmailToken) return 'Gmail connected';
      if (row.microsoftToken) return 'Microsoft connected';
      return 'Not connected';
    },
  },
  {
    id: 'signature',
    header: 'Signature',
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasSignature = row.original.signature && row.original.signature.trim().length > 0;
      const staffName = `${row.original.firstName} ${row.original.lastName}`;

      return (
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full ${
              hasSignature ? 'bg-blue-100' : 'bg-slate-100'
            }`}
          >
            <FileText className={`h-3 w-3 ${hasSignature ? 'text-blue-600' : 'text-slate-400'}`} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${hasSignature ? 'text-blue-700' : 'text-slate-500'}`}>
                {hasSignature ? 'Set' : 'Not set'}
              </span>
              <SignatureEditModal
                staffId={row.original.id}
                currentSignature={row.original.signature}
                staffName={staffName}
                updateSignature={staffHooks?.updateSignature}
                isUpdatingSignature={staffHooks?.isUpdatingSignature}
              />
            </div>
            {hasSignature && <SignatureDisplay signature={row.original.signature || ''} />}
          </div>
        </div>
      );
    },
    accessorFn: (row: Staff) => (row.signature ? 'Set' : 'Not set'),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }: { row: Row<Staff> }) => {
      const date = new Date(row.getValue('createdAt'));
      return <div className="text-sm text-slate-600">{date.toLocaleDateString()}</div>;
    },
  },
  {
    id: 'actions',
    cell: ({ row }: { row: Row<Staff> }) => {
      const hasGmailAccount = row.original.gmailToken !== null;
      const hasMicrosoftAccount = row.original.microsoftToken !== null;
      const hasLinkedAccount = hasGmailAccount || hasMicrosoftAccount;

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
                  {hasGmailAccount && (
                    <EmailDisconnectButton
                      staffId={row.original.id}
                      provider="gmail"
                      disconnectStaffGmail={staffHooks?.disconnectStaffGmail}
                      disconnectStaffMicrosoft={staffHooks?.disconnectStaffMicrosoft}
                      isDisconnecting={staffHooks?.isDisconnecting}
                    />
                  )}
                  {hasMicrosoftAccount && (
                    <EmailDisconnectButton
                      staffId={row.original.id}
                      provider="microsoft"
                      disconnectStaffGmail={staffHooks?.disconnectStaffGmail}
                      disconnectStaffMicrosoft={staffHooks?.disconnectStaffMicrosoft}
                      isDisconnecting={staffHooks?.isDisconnecting}
                    />
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <SignatureEditMenuItem
                staffId={row.original.id}
                currentSignature={row.original.signature}
                staffName={`${row.original.firstName} ${row.original.lastName}`}
                updateSignature={staffHooks?.updateSignature}
                isUpdatingSignature={staffHooks?.isUpdatingSignature}
              />
              <DropdownMenuSeparator />
              <DeleteStaffButton
                staffId={row.original.id}
                deleteStaff={staffHooks?.deleteStaff}
                isDeleting={staffHooks?.isDeleting}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
