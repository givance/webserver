// Test script for donor analysis tool
import { createDonorAnalysisTool } from "./src/app/lib/services/whatsapp/donor-analysis-tool";

async function test() {
  const tool = createDonorAnalysisTool("test-org-id");
  console.log("Tool created successfully:", Object.keys(tool));
  console.log("Tool description:", tool.analyzeDonors.description);
}

test().catch(console.error);