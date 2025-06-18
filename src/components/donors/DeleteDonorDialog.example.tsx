/**
 * Example usage of the DeleteDonorDialog component
 * 
 * This component demonstrates how to integrate the donor deletion dialog
 * with different deletion modes based on the context.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { DeleteDonorDialog } from "./DeleteDonorDialog";

// Example 1: Delete donor from a specific list view
export function DonorListItemExample({ donor, list }: { 
  donor: { id: number; firstName: string; lastName: string };
  list: { id: number; name: string };
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded">
        <span>{donor.firstName} {donor.lastName}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      <DeleteDonorDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        donorId={donor.id}
        donorName={`${donor.firstName} ${donor.lastName}`}
        listId={list.id}
        listName={list.name}
        onSuccess={() => {
          // Refresh the list or navigate away
          console.log("Donor removed/deleted successfully");
        }}
      />
    </>
  );
}

// Example 2: Delete donor from the main donors page (not in a list context)
export function DonorTableRowExample({ donor }: { 
  donor: { id: number; firstName: string; lastName: string };
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  return (
    <>
      <tr>
        <td>{donor.firstName} {donor.lastName}</td>
        <td>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
      
      <DeleteDonorDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        donorId={donor.id}
        donorName={`${donor.firstName} ${donor.lastName}`}
        // No listId or listName provided - will show simple delete confirmation
        onSuccess={() => {
          // Refresh the table or remove the row
          console.log("Donor deleted successfully");
        }}
      />
    </>
  );
}

// Example 3: Using the deletion functions directly without the dialog
import { useDonors } from "@/app/hooks/use-donors";

export function DirectDeletionExample() {
  const { deleteDonor, getDonorListCount } = useDonors();
  
  const handleRemoveFromList = async (donorId: number, listId: number) => {
    // Remove donor from a specific list only
    await deleteDonor(donorId, {
      deleteMode: 'fromList',
      listId: listId,
    });
  };
  
  const handleRemoveFromAllLists = async (donorId: number) => {
    // Remove donor from all lists but keep their profile
    await deleteDonor(donorId, {
      deleteMode: 'fromAllLists',
    });
  };
  
  const handleDeleteEntirely = async (donorId: number) => {
    // Check how many lists the donor is in first
    const { data } = await getDonorListCount(donorId);
    
    if (data?.count && data.count > 1) {
      // Show a warning or confirmation dialog
      const confirmed = window.confirm(
        `This donor is in ${data.count} lists. Are you sure you want to delete them entirely?`
      );
      if (!confirmed) return;
    }
    
    // Delete the donor entirely
    await deleteDonor(donorId, {
      deleteMode: 'entirely',
    });
  };
  
  return (
    <div className="space-y-4">
      <Button onClick={() => handleRemoveFromList(123, 456)}>
        Remove from Current List
      </Button>
      <Button onClick={() => handleRemoveFromAllLists(123)}>
        Remove from All Lists
      </Button>
      <Button variant="destructive" onClick={() => handleDeleteEntirely(123)}>
        Delete Donor Entirely
      </Button>
    </div>
  );
}