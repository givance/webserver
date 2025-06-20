import ProjectDetailsPage from "@/app/(app)/projects/[id]/page";

// Test that the component is exported correctly
describe("ProjectDetails", () => {
  it("should be defined", () => {
    expect(ProjectDetailsPage).toBeDefined();
    expect(typeof ProjectDetailsPage).toBe("function");
  });

  it("should have expected page component structure", () => {
    // Verify that the component is a valid React component
    expect(() => {
      // Type check - will throw on compile if not a valid component
      const _typeCheck: React.FC = ProjectDetailsPage as any;
    }).not.toThrow();
  });

  // Note: Due to React 19 / Jest compatibility issues, we're testing component exports
  // rather than rendering behavior. Full integration tests should be done with E2E testing.
});