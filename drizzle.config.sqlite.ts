import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/app/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "./test-e2e.db",
  },
});
