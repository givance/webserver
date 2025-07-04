"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Edit, ArrowLeft, UserMinus, Users2 } from "lucide-react";
import Link from "next/link";
import { useLists } from "@/app/hooks/use-lists";
import { useDonors } from "@/app/hooks/use-donors";
import { LoadingSkeleton } from "@/app/components/LoadingSkeleton";
import { ErrorDisplay } from "@/app/components/ErrorDisplay";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import type { ColumnDef } from "@tanstack/react-table";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useStaff } from "@/app/hooks/use-staff";
import { toast } from "sonner";

// Type for list member display
type ListMember = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  addedAt: string;
};

// Type for donor selection
type SelectableDonor = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  selected: boolean;
};

function AddDonorsDialog({ listId, listName }: { listId: number; listName: string }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDonorIds, setSelectedDonorIds] = useState<number[]>([]);

  const { listDonors } = useDonors();
  const { addDonorsToList, isAddingDonors, getDonorListWithMembersQuery } = useLists();

  // Get current list members to exclude from selection
  const { data: currentList } = getDonorListWithMembersQuery(listId);
  const currentMemberIds = useMemo(() => {
    return new Set(currentList?.members?.map((member) => member.donor.id) || []);
  }, [currentList]);

  // Get donors for selection
  const { data: donorsResponse, isLoading: isDonorsLoading } = listDonors({
    searchTerm,
    orderBy: "firstName",
    orderDirection: "asc",
  });

  const selectableDonors: SelectableDonor[] = useMemo(() => {
    return (
      donorsResponse?.donors
        ?.filter((donor) => !currentMemberIds.has(donor.id)) // Filter out donors already in the list
        ?.map((donor) => ({
          id: donor.id,
          name: formatDonorName(donor),
          email: donor.email,
          phone: donor.phone || null,
          selected: selectedDonorIds.includes(donor.id),
        })) || []
    );
  }, [donorsResponse, selectedDonorIds, currentMemberIds]);

  const handleDonorToggle = (donorId: number, checked: boolean) => {
    setSelectedDonorIds((prev) => (checked ? [...prev, donorId] : prev.filter((id) => id !== donorId)));
  };

  const handleAddDonors = async () => {
    if (selectedDonorIds.length === 0) return;

    try {
      await addDonorsToList(listId, selectedDonorIds);
      setSelectedDonorIds([]);
      setSearchTerm("");
      setOpen(false);
    } catch (error) {
      console.error("Error adding donors:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Donors
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Donors to &quot;{listName}&quot;</DialogTitle>
          <DialogDescription>Select donors to add to this list. You can search by name or email.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <Input
            placeholder="Search donors by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {isDonorsLoading ? (
            <LoadingSkeleton />
          ) : (
            <div className="flex-1 overflow-auto">
              {selectableDonors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  {searchTerm ? (
                    <>
                      <h3 className="font-medium mb-2">No available donors found</h3>
                      <p className="text-sm">No donors match your search that aren&apos;t already in this list.</p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-medium mb-2">All donors are already in this list</h3>
                      <p className="text-sm">All your donors are already members of this list.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectableDonors.map((donor) => (
                    <div key={donor.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50">
                      <Checkbox
                        checked={donor.selected}
                        onCheckedChange={(checked) => handleDonorToggle(donor.id, !!checked)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{donor.name}</div>
                        <div className="text-sm text-muted-foreground">{donor.email}</div>
                        {donor.phone && <div className="text-sm text-muted-foreground">{donor.phone}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              {selectedDonorIds.length} donor{selectedDonorIds.length !== 1 ? "s" : ""} selected
            </span>
            <div className="space-x-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddDonors} disabled={selectedDonorIds.length === 0 || isAddingDonors}>
                {isAddingDonors
                  ? "Adding..."
                  : `Add ${selectedDonorIds.length} Donor${selectedDonorIds.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDonorButton({ listId, donorId, donorName }: { listId: number; donorId: number; donorName: string }) {
  const [open, setOpen] = useState(false);
  const { removeDonorsFromList, isRemovingDonors } = useLists();

  const handleRemove = async () => {
    try {
      await removeDonorsFromList(listId, [donorId]);
      setOpen(false);
    } catch (error) {
      console.error("Error removing donor:", error);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserMinus className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Donor</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove &quot;{donorName}&quot; from this list?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRemove} className="bg-red-500 hover:bg-red-700" disabled={isRemovingDonors}>
            {isRemovingDonors ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ListDetailPage() {
  const params = useParams();
  const listId = Number(params.id);
  const [isBulkStaffDialogOpen, setIsBulkStaffDialogOpen] = useState(false);
  const [selectedBulkStaffId, setSelectedBulkStaffId] = useState<string>("");

  const { getDonorListWithMembersQuery, bulkUpdateMembersStaff, isBulkUpdatingStaff } = useLists();
  const { getStaffMembers } = useStaff();
  const { staffMembers } = getStaffMembers();
  const { data: list, isLoading, error } = getDonorListWithMembersQuery(listId);

  // Transform list members for display
  const members: ListMember[] = useMemo(() => {
    return (
      list?.members?.map((member) => ({
        id: member.donor.id,
        name: formatDonorName(member.donor),
        email: member.donor.email,
        phone: member.donor.phone,
        addedAt: member.addedAt,
      })) || []
    );
  }, [list]);

  // Handler for bulk updating staff assignment for all list members
  const handleBulkUpdateStaff = async () => {
    if (!selectedBulkStaffId) {
      toast.error("Please select a staff member");
      return;
    }

    const staffId = selectedBulkStaffId === "unassigned" ? null : parseInt(selectedBulkStaffId);
    
    try {
      await bulkUpdateMembersStaff(listId, staffId);
      setIsBulkStaffDialogOpen(false);
      setSelectedBulkStaffId("");
    } catch (error) {
      console.error("Failed to bulk update staff:", error);
    }
  };

  // Define columns for the members table
  const columns: ColumnDef<ListMember>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link href={`/donors/${row.original.id}`} className="font-medium hover:underline">
            {row.getValue("name")}
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.getValue("phone") || "—",
      },
      {
        accessorKey: "addedAt",
        header: "Added",
        cell: ({ row }) => new Date(row.getValue("addedAt")).toLocaleDateString(),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RemoveDonorButton listId={listId} donorId={row.original.id} donorName={row.original.name} />
        ),
      },
    ],
    [listId]
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !list) {
    return <ErrorDisplay error={error?.message || "List not found"} title="Error loading list" />;
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 mb-6">
        <Link href="/lists" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Lists</span>
        <span className="text-muted-foreground">/</span>
        <span>{list.name}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <h1 className="text-2xl font-bold">{list.name}</h1>
            <Badge variant={list.isActive ? "default" : "secondary"}>{list.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          {list.description && <p className="text-muted-foreground">{list.description}</p>}
          <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>
                {members.length} member{members.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span>Created {new Date(list.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex space-x-2">
          {members.length > 0 && (
            <Button onClick={() => setIsBulkStaffDialogOpen(true)} variant="outline" className="flex items-center gap-2">
              <Users2 className="w-4 h-4" />
              Assign Staff to All ({members.length})
            </Button>
          )}
          <AddDonorsDialog listId={listId} listName={list.name} />
          <Link href={`/lists/${listId}/edit`}>
            <Button variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>List Members</CardTitle>
          <CardDescription>Donors who are part of this list. You can add or remove members as needed.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No members yet</h3>
              <p className="text-muted-foreground mb-4">
                This list doesn&apos;t have any donors yet. Add some donors to get started.
              </p>
              <AddDonorsDialog listId={listId} listName={list.name} />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={members}
              totalItems={members.length}
              pageSize={50}
              pageCount={1}
              currentPage={1}
              onPageChange={() => {}}
            />
          )}
        </CardContent>
      </Card>

      {/* Bulk Staff Assignment Dialog */}
      <Dialog open={isBulkStaffDialogOpen} onOpenChange={setIsBulkStaffDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Assign Staff to All List Members</DialogTitle>
            <DialogDescription>
              Assign a staff member to all {members.length} member{members.length !== 1 ? "s" : ""} in this list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="bulk-staff-select" className="text-right">
                Staff Member
              </Label>
              <Select value={selectedBulkStaffId} onValueChange={setSelectedBulkStaffId}>
                <SelectTrigger className="col-span-3" id="bulk-staff-select">
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffMembers?.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id.toString()}>
                      {staff.firstName} {staff.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkStaffDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkUpdateStaff}
              disabled={!selectedBulkStaffId || isBulkUpdatingStaff}
            >
              {isBulkUpdatingStaff ? "Assigning..." : "Assign Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
