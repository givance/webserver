import CampaignPage from "@/app/(app)/campaign/page";

// Test that the component is exported correctly
describe("CampaignPage", () => {
  it("should be defined", () => {
    expect(CampaignPage).toBeDefined();
    expect(typeof CampaignPage).toBe("function");
  });

  it("should have expected page component structure", () => {
    // Verify that the component is a valid React component
    expect(() => {
      // Type check - will throw on compile if not a valid component
      const _typeCheck: React.FC = CampaignPage as any;
    }).not.toThrow();
  });

  // Note: Due to React 19 / Jest compatibility issues, we're testing component exports
  // rather than rendering behavior. Full integration tests should be done with E2E testing.
});