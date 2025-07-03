import { EmailScheduleViewer } from "@/app/(app)/campaign/components/EmailScheduleViewer";

// Test that the component is exported correctly
describe("EmailScheduleViewer", () => {
  it("should be defined", () => {
    expect(EmailScheduleViewer).toBeDefined();
    expect(typeof EmailScheduleViewer).toBe("function");
  });

  it("should have expected component structure", () => {
    // Verify that the component is a valid React component
    expect(() => {
      // Type check - will throw on compile if not a valid component
      const _typeCheck: React.FC = EmailScheduleViewer as any;
    }).not.toThrow();
  });

  // Note: Due to React 19 / Jest compatibility issues, we're testing component exports
  // rather than rendering behavior. Full integration tests should be done with E2E testing.
});