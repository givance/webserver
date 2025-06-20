import React from "react";
import { render, screen } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import { CampaignButton } from "@/components/campaign/CampaignButton";

// Mock the CampaignSteps component
jest.mock("@/app/(app)/campaign/components/CampaignSteps", () => ({
  CampaignSteps: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="campaign-steps-modal">
      <p>Campaign Steps</p>
      <button onClick={onClose}>Close Campaign</button>
    </div>
  ),
}));

describe("CampaignButton", () => {
  it("renders the campaign button", () => {
    render(<CampaignButton />);
    
    const button = screen.getByRole("button", { name: /campaign/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dialog when button is clicked", async () => {
    const user = userEvent.setup();
    render(<CampaignButton />);
    
    // Initially, dialog content should not be visible
    expect(screen.queryByTestId("campaign-steps-modal")).not.toBeInTheDocument();
    
    // Click the button
    const button = screen.getByRole("button", { name: /campaign/i });
    await user.click(button);
    
    // Dialog should open with campaign steps
    expect(screen.getByTestId("campaign-steps-modal")).toBeInTheDocument();
    expect(screen.getByText("Campaign Steps")).toBeInTheDocument();
  });

  it("shows dialog title when opened", async () => {
    const user = userEvent.setup();
    render(<CampaignButton />);
    
    const button = screen.getByRole("button", { name: /campaign/i });
    await user.click(button);
    
    // Check for dialog title
    const dialogTitle = screen.getByRole("heading", { name: /campaign/i });
    expect(dialogTitle).toBeInTheDocument();
  });

  it("closes dialog when close is triggered from CampaignSteps", async () => {
    const user = userEvent.setup();
    render(<CampaignButton />);
    
    // Open dialog
    const button = screen.getByRole("button", { name: /campaign/i });
    await user.click(button);
    
    // Verify dialog is open
    expect(screen.getByTestId("campaign-steps-modal")).toBeInTheDocument();
    
    // Click close button inside campaign steps
    const closeButton = screen.getByRole("button", { name: /close campaign/i });
    await user.click(closeButton);
    
    // Dialog should close
    expect(screen.queryByTestId("campaign-steps-modal")).not.toBeInTheDocument();
  });

  it("can be reopened after closing", async () => {
    const user = userEvent.setup();
    render(<CampaignButton />);
    
    const button = screen.getByRole("button", { name: /campaign/i });
    
    // Open dialog
    await user.click(button);
    expect(screen.getByTestId("campaign-steps-modal")).toBeInTheDocument();
    
    // Close dialog
    const closeButton = screen.getByRole("button", { name: /close campaign/i });
    await user.click(closeButton);
    expect(screen.queryByTestId("campaign-steps-modal")).not.toBeInTheDocument();
    
    // Reopen dialog
    await user.click(button);
    expect(screen.getByTestId("campaign-steps-modal")).toBeInTheDocument();
  });

  it("applies correct dialog styling", async () => {
    const user = userEvent.setup();
    render(<CampaignButton />);
    
    const button = screen.getByRole("button", { name: /campaign/i });
    await user.click(button);
    
    // Check that dialog content has the expected classes
    const dialogContent = screen.getByRole("dialog");
    expect(dialogContent).toHaveClass("max-w-6xl", "h-[90vh]", "p-0");
  });
});