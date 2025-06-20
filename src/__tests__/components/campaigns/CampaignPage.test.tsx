import React from "react";
import { render, screen } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import CampaignPage from "@/app/(app)/campaign/page";

// Mock the CampaignSteps component
jest.mock("@/app/(app)/campaign/components/CampaignSteps", () => ({
  CampaignSteps: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="campaign-steps">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Get the mocked router from setup
const mockRouter = require("next/navigation").useRouter();

describe("CampaignPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
  });

  it("renders the campaign page with title and description", () => {
    render(<CampaignPage />);

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("Create a new campaign to engage with your donors.")).toBeInTheDocument();
  });

  it("renders the CampaignSteps component", () => {
    render(<CampaignPage />);

    expect(screen.getByTestId("campaign-steps")).toBeInTheDocument();
  });

  it("navigates to existing campaigns when close is triggered", async () => {
    const user = userEvent.setup();
    render(<CampaignPage />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(mockRouter.push).toHaveBeenCalledWith("/existing-campaigns");
  });
});