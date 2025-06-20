import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import { DeleteDonorDialog } from "@/components/donors/DeleteDonorDialog";

// Mock the hooks
jest.mock("@/app/hooks/use-donors");

describe("DeleteDonorDialog", () => {
  const mockProps = {
    open: true,
    onOpenChange: jest.fn(),
    donorId: 123,
    donorName: "John Doe",
    onSuccess: jest.fn(),
  };

  const mockUseDonors = {
    deleteDonor: jest.fn(),
    isDeleting: false,
    getDonorListCount: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    require("@/app/hooks/use-donors").useDonors.mockReturnValue(mockUseDonors);
  });

  describe("when donor is not in any lists", () => {
    beforeEach(() => {
      mockUseDonors.getDonorListCount.mockReturnValue({ data: { count: 0 } });
    });

    it("shows simple delete confirmation", () => {
      render(<DeleteDonorDialog {...mockProps} />);

      expect(screen.getByText("Delete Donor")).toBeInTheDocument();
      expect(
        screen.getByText(`Are you sure you want to permanently delete ${mockProps.donorName}? This action cannot be undone.`)
      ).toBeInTheDocument();
      expect(
        screen.getByText("All data associated with this donor will be permanently deleted.")
      ).toBeInTheDocument();
    });

    it("handles delete action", async () => {
      const user = userEvent.setup();
      mockUseDonors.deleteDonor.mockResolvedValueOnce(true);

      render(<DeleteDonorDialog {...mockProps} />);

      const deleteButton = screen.getByRole("button", { name: "Delete Donor" });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockUseDonors.deleteDonor).toHaveBeenCalledWith(123, {
          deleteMode: "entirely",
          listId: undefined,
        });
        expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
        expect(mockProps.onSuccess).toHaveBeenCalled();
      });
    });

    it("handles cancel action", async () => {
      const user = userEvent.setup();
      render(<DeleteDonorDialog {...mockProps} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
      expect(mockUseDonors.deleteDonor).not.toHaveBeenCalled();
    });

    it("shows loading state during deletion", () => {
      mockUseDonors.isDeleting = true;
      render(<DeleteDonorDialog {...mockProps} />);

      expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
  });

  describe("when donor is in one list", () => {
    beforeEach(() => {
      mockUseDonors.getDonorListCount.mockReturnValue({ data: { count: 1 } });
    });

    it("shows simple delete confirmation even with listId", () => {
      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      expect(screen.getByText("Delete Donor")).toBeInTheDocument();
      expect(
        screen.getByText(`Are you sure you want to permanently delete ${mockProps.donorName}? This action cannot be undone.`)
      ).toBeInTheDocument();
    });
  });

  describe("when donor is in multiple lists", () => {
    beforeEach(() => {
      mockUseDonors.getDonorListCount.mockReturnValue({ data: { count: 3 } });
    });

    it("shows delete options when accessed from a list", () => {
      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      expect(screen.getByText("Delete John Doe")).toBeInTheDocument();
      expect(screen.getByText("Choose how you want to delete this donor:")).toBeInTheDocument();
      
      // Check radio options
      expect(screen.getByLabelText("Remove from Major Donors only")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove from all lists (3 lists)")).toBeInTheDocument();
      expect(screen.getByLabelText("Delete donor entirely")).toBeInTheDocument();
    });

    it("defaults to 'fromList' option", () => {
      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      const fromListRadio = screen.getByLabelText("Remove from Major Donors only");
      expect(fromListRadio).toBeChecked();
    });

    it("handles delete from list only", async () => {
      const user = userEvent.setup();
      mockUseDonors.deleteDonor.mockResolvedValueOnce(true);

      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      const deleteButton = screen.getByRole("button", { name: "Delete" });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockUseDonors.deleteDonor).toHaveBeenCalledWith(123, {
          deleteMode: "fromList",
          listId: 1,
        });
      });
    });

    it("handles delete from all lists", async () => {
      const user = userEvent.setup();
      mockUseDonors.deleteDonor.mockResolvedValueOnce(true);

      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      const fromAllListsRadio = screen.getByLabelText("Remove from all lists (3 lists)");
      await user.click(fromAllListsRadio);

      const deleteButton = screen.getByRole("button", { name: "Delete" });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockUseDonors.deleteDonor).toHaveBeenCalledWith(123, {
          deleteMode: "fromAllLists",
          listId: undefined,
        });
      });
    });

    it("handles delete entirely", async () => {
      const user = userEvent.setup();
      mockUseDonors.deleteDonor.mockResolvedValueOnce(true);

      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      const deleteEntirelyRadio = screen.getByLabelText("Delete donor entirely");
      await user.click(deleteEntirelyRadio);

      const deleteButton = screen.getByRole("button", { name: "Delete" });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockUseDonors.deleteDonor).toHaveBeenCalledWith(123, {
          deleteMode: "entirely",
          listId: undefined,
        });
      });
    });

    it("shows warning for delete entirely option", async () => {
      const user = userEvent.setup();
      render(<DeleteDonorDialog {...mockProps} listId={1} listName="Major Donors" />);

      const deleteEntirelyRadio = screen.getByLabelText("Delete donor entirely");
      await user.click(deleteEntirelyRadio);

      expect(
        screen.getByText("This will permanently delete the donor and all associated data.")
      ).toBeInTheDocument();
    });
  });

  describe("when dialog is closed", () => {
    it("does not render content", () => {
      render(<DeleteDonorDialog {...mockProps} open={false} />);

      expect(screen.queryByText("Delete Donor")).not.toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("keeps dialog open when deletion fails", async () => {
      const user = userEvent.setup();
      mockUseDonors.deleteDonor.mockResolvedValueOnce(false);
      mockUseDonors.getDonorListCount.mockReturnValue({ data: { count: 0 } });

      render(<DeleteDonorDialog {...mockProps} />);

      const deleteButton = screen.getByRole("button", { name: "Delete Donor" });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockUseDonors.deleteDonor).toHaveBeenCalled();
        expect(mockProps.onOpenChange).not.toHaveBeenCalledWith(false);
        expect(mockProps.onSuccess).not.toHaveBeenCalled();
      });
    });
  });
});