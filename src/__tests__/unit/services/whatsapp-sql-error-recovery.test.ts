import { WhatsAppSQLEngineService, SQLExecutionResult } from "@/app/lib/services/whatsapp/whatsapp-sql-engine.service";

// Mock the database and logger
jest.mock("@/app/lib/db", () => ({
  db: {
    execute: jest.fn(),
  },
}));

jest.mock("@/app/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("WhatsApp SQL Error Recovery", () => {
  let sqlEngine: WhatsAppSQLEngineService;

  beforeEach(() => {
    sqlEngine = new WhatsAppSQLEngineService();
    jest.clearAllMocks();
  });

  describe("SQL Error Classification", () => {
    it("should return error information instead of throwing", async () => {
      const { db } = require("@/app/lib/db");

      // Mock a syntax error
      db.execute.mockRejectedValue(new Error('syntax error at or near "s"'));

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FROM donors WHERE organization_id = 'test'",
        organizationId: "test-org",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe("syntax");
      expect(result.error?.message).toContain("syntax error");
      expect(result.error?.suggestion).toBeDefined();
    });

    it("should classify security errors correctly", async () => {
      const { db } = require("@/app/lib/db");

      // Mock a security error
      db.execute.mockRejectedValue(
        new Error("SELECT/UPDATE queries on tables with organization_id must include WHERE organization_id filter")
      );

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FROM donors",
        organizationId: "test-org",
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe("security");
    });

    it("should classify runtime errors correctly", async () => {
      const { db } = require("@/app/lib/db");

      // Mock a runtime error
      db.execute.mockRejectedValue(new Error('relation "invalid_table" does not exist'));

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FROM invalid_table WHERE organization_id = 'test'",
        organizationId: "test-org",
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe("runtime");
    });
  });

  describe("Error Suggestions", () => {
    it("should provide helpful suggestions for syntax errors", async () => {
      const { db } = require("@/app/lib/db");

      db.execute.mockRejectedValue(new Error('syntax error at or near "FROM"'));

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FRM donors WHERE organization_id = 'test'",
        organizationId: "test-org",
      });

      expect(result.error?.suggestion).toContain("Check the SQL syntax");
      expect(result.error?.suggestion).toContain("from");
    });

    it("should provide suggestions for missing organization_id", async () => {
      const { db } = require("@/app/lib/db");

      db.execute.mockRejectedValue(
        new Error("SELECT/UPDATE queries on tables with organization_id must include WHERE organization_id filter")
      );

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FROM donors",
        organizationId: "test-org",
      });

      expect(result.error?.suggestion).toContain("WHERE organization_id");
    });
  });

  describe("Successful Execution", () => {
    it("should return success result for valid queries", async () => {
      const { db } = require("@/app/lib/db");

      const mockRows = [{ id: 1, name: "Test Donor" }];
      db.execute.mockResolvedValue({ rows: mockRows });

      const result: SQLExecutionResult = await sqlEngine.executeRawSQL({
        query: "SELECT * FROM donors WHERE organization_id = 'test'",
        organizationId: "test-org",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRows);
      expect(result.error).toBeUndefined();
    });
  });

  describe("Legacy Compatibility", () => {
    it("should maintain backward compatibility with legacy method", async () => {
      const { db } = require("@/app/lib/db");

      const mockRows = [{ id: 1, name: "Test Donor" }];
      db.execute.mockResolvedValue({ rows: mockRows });

      const result = await sqlEngine.executeRawSQLLegacy({
        query: "SELECT * FROM donors WHERE organization_id = 'test'",
        organizationId: "test-org",
      });

      expect(result).toEqual(mockRows);
    });

    it("should throw error in legacy method when SQL fails", async () => {
      const { db } = require("@/app/lib/db");

      db.execute.mockRejectedValue(new Error("syntax error"));

      await expect(
        sqlEngine.executeRawSQLLegacy({
          query: "INVALID SQL",
          organizationId: "test-org",
        })
      ).rejects.toThrow("SQL execution failed: syntax error");
    });
  });
});
