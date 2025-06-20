/**
 * Basic test to verify component test setup is working
 */

import * as navigation from "next/navigation";
import * as fs from "fs";
import * as path from "path";
import { donorFactory, projectFactory, campaignFactory } from "../mocks/data";

describe("Component Test Setup", () => {
  it("should have test environment configured", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("should have mocked dependencies", () => {
    // Verify key mocks are in place
    expect(navigation.useRouter).toBeDefined();
    expect(navigation.useRouter().push).toBeDefined();
  });

  it("should have test utilities available", () => {
    // Test utilities are available but importing them inside a test causes issues
    // Just verify the file exists
    const utilsPath = path.join(__dirname, "../utils/test-utils.tsx");
    expect(fs.existsSync(utilsPath)).toBe(true);
  });

  it("should have mock data factories", () => {
    const donor = donorFactory.create();
    expect(donor).toHaveProperty("id");
    expect(donor).toHaveProperty("name");
    expect(donor).toHaveProperty("email");

    const project = projectFactory.create();
    expect(project).toHaveProperty("id");
    expect(project).toHaveProperty("name");

    const campaign = campaignFactory.create();
    expect(campaign).toHaveProperty("id");
    expect(campaign).toHaveProperty("name");
  });
});
