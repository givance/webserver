import { exampleRouter } from "@/app/api/trpc/routers/example";
import { createTestContext } from "@/__tests__/utils/trpc-router-test-utils";

describe("exampleRouter", () => {
  describe("hello", () => {
    it("should return greeting with name when provided", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.hello({ name: "Alice" });
      
      expect(result.greeting).toBe("Hello Alice!");
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it("should return greeting with 'world' when name not provided", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.hello({});
      
      expect(result.greeting).toBe("Hello world!");
      expect(result.timestamp).toBeDefined();
    });

    it("should work without authentication (public procedure)", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.hello({ name: "Bob" });
      
      expect(result.greeting).toBe("Hello Bob!");
    });
  });

  describe("getServerTime", () => {
    it("should return server time information", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.getServerTime();
      
      expect(result.time).toBeDefined();
      expect(result.unixTimestamp).toBeDefined();
      expect(result.formatted).toBeDefined();
      
      // Verify time is valid ISO string
      expect(new Date(result.time)).toBeInstanceOf(Date);
      
      // Verify unix timestamp is a number
      expect(typeof result.unixTimestamp).toBe("number");
      expect(result.unixTimestamp).toBeGreaterThan(0);
    });

    it("should work without authentication (public procedure)", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.getServerTime();
      
      expect(result.time).toBeDefined();
    });
  });

  describe("add", () => {
    it("should add two numbers correctly", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.add({ a: 5, b: 3 });
      
      expect(result.sum).toBe(8);
    });

    it("should handle negative numbers", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.add({ a: -5, b: 3 });
      
      expect(result.sum).toBe(-2);
    });

    it("should handle decimal numbers", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.add({ a: 1.5, b: 2.5 });
      
      expect(result.sum).toBe(4);
    });

    it("should handle zero", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.add({ a: 0, b: 0 });
      
      expect(result.sum).toBe(0);
    });

    it("should work without authentication (public procedure)", async () => {
      const ctx = createTestContext({ auth: { user: null } });
      const caller = exampleRouter.createCaller(ctx);
      
      const result = await caller.add({ a: 10, b: 20 });
      
      expect(result.sum).toBe(30);
    });

    it("should validate input types", async () => {
      const ctx = createTestContext();
      const caller = exampleRouter.createCaller(ctx);
      
      // Test with invalid input
      await expect(
        caller.add({ a: "not a number" as any, b: 5 })
      ).rejects.toThrow();
      
      await expect(
        caller.add({ a: 5, b: null as any })
      ).rejects.toThrow();
      
      await expect(
        caller.add({ a: 5 } as any)
      ).rejects.toThrow();
    });
  });
});