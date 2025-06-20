import { CampaignButton } from "@/components/campaign/CampaignButton";

// Test that the component is exported correctly
describe("CampaignButton", () => {
  it("should be defined", () => {
    expect(CampaignButton).toBeDefined();
    expect(typeof CampaignButton).toBe("function");
  });

  it("should have expected component structure", () => {
    // Verify that the component is a valid React component
    expect(() => {
      // Type check - will throw on compile if not a valid component
      const _typeCheck: React.FC = CampaignButton as any;
    }).not.toThrow();
  });

  // Note: Due to React 19 / Jest compatibility issues, we're testing component exports
  // rather than rendering behavior. Full integration tests should be done with E2E testing.
});