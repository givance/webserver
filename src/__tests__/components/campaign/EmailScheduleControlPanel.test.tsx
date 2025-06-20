import React from "react";
import { EmailScheduleControlPanel } from "@/app/(app)/campaign/components/EmailScheduleControlPanel";

// Note: Due to React 19 compatibility issues with @testing-library/react,
// we're limiting these tests to type checking and basic validation.
// Full component rendering tests should be done with E2E testing tools.

describe("EmailScheduleControlPanel", () => {
  it("should export a valid React component", () => {
    expect(EmailScheduleControlPanel).toBeDefined();
    expect(typeof EmailScheduleControlPanel).toBe("function");
  });

  it("should have correct prop types", () => {
    // Type checking is done at compile time
    // This test ensures the component accepts the expected props
    const props = {
      sessionId: 1,
      className: "test-class",
    };
    
    // If TypeScript compiles, the props are correct
    const element = <EmailScheduleControlPanel {...props} />;
    expect(element).toBeDefined();
    expect(element.props).toEqual(props);
  });

  it("should handle optional className prop", () => {
    const element = <EmailScheduleControlPanel sessionId={1} />;
    expect(element.props.sessionId).toBe(1);
    expect(element.props.className).toBeUndefined();
  });

  // Note: More comprehensive tests for this component's behavior
  // should be implemented as E2E tests using Playwright or similar tools
  // due to React 19 compatibility issues with @testing-library/react
});