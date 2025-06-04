import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import type { DonorJourney } from "@/app/lib/data/organizations";
import { z } from "zod";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a donor journey analyzer that converts natural language descriptions into graph structures.
Your task is to analyze the donor journey description and create a structured graph representation with nodes and edges.

Rules:
1. Each node must represent a distinct stage or entity in the donor journey
2. Each node must have a properties object with:
   - description: A detailed description of the stage
   - actions: An array of specific actions that need to be taken at this stage
3. Each edge must represent a meaningful transition or relationship between nodes
4. Each edge must have a properties object with at least a description field
5. Use descriptive labels that capture the essence of each stage/transition
6. Ensure the graph structure is logically connected and follows the journey flow

Example output format:
{
  "nodes": [
    {
      "id": "n1",
      "label": "Initial Contact",
      "properties": {
        "description": "First interaction with potential donor",
        "expectedDuration": "1-2 weeks",
        "actions": [
          "Send welcome email xx days after initial contact",
          "Add to CRM",
          "Schedule initial call xx days after initial contact"
        ]
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "label": "FOLLOW_UP",
      "properties": {
        "description": "Send follow-up email after initial contact",
        "typicalDelay": "3 days"
      }
    }
  ]
}`;

// Define the schema for the donor journey
const donorJourneySchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      properties: z
        .object({
          description: z.string(),
          actions: z.array(z.string()).optional(),
        })
        .and(z.record(z.any())), // Allow additional properties
    })
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      label: z.string(),
      properties: z
        .object({
          description: z.string(),
        })
        .and(z.record(z.any())), // Allow additional properties
    })
  ),
});

export class DonorJourneyService {
  /**
   * Processes a donor journey description and generates a graph structure
   */
  static async processJourney(description: string): Promise<DonorJourney> {
    try {
      logger.info("Processing donor journey description");

      const { object: journey } = await generateObject({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: donorJourneySchema,
        prompt: `Based on this donor journey description, generate a graph structure with nodes representing stages and edges representing transitions. Each node and edge must have a descriptive properties object.

Description:
${description}`,
        system: SYSTEM_PROMPT,
      });

      logger.info("Successfully processed donor journey", {
        nodeCount: journey.nodes.length,
        edgeCount: journey.edges.length,
      });

      logger.info(`system prompt: ${SYSTEM_PROMPT}`);
      logger.info(`model response: ${JSON.stringify(journey, null, 2)}`);

      return journey;
    } catch (error) {
      logger.error("Failed to process donor journey:", error);
      throw error;
    }
  }

  /**
   * Validates the structure of a donor journey object
   */
  private static isValidDonorJourney(journey: any): journey is DonorJourney {
    if (!journey || typeof journey !== "object") return false;
    if (!Array.isArray(journey.nodes) || !Array.isArray(journey.edges)) return false;

    // Validate nodes
    const validNodes = journey.nodes.every((node: any) =>
      Boolean(
        node &&
          typeof node === "object" &&
          typeof node.id === "string" &&
          typeof node.label === "string" &&
          node.properties &&
          typeof node.properties === "object" &&
          typeof node.properties.description === "string" &&
          typeof node.properties.actions === "object" &&
          Array.isArray(node.properties.actions)
      )
    );

    if (!validNodes) return false;

    // Validate edges
    const validEdges = journey.edges.every((edge: any) =>
      Boolean(
        edge &&
          typeof edge === "object" &&
          typeof edge.id === "string" &&
          typeof edge.source === "string" &&
          typeof edge.target === "string" &&
          typeof edge.label === "string" &&
          edge.properties &&
          typeof edge.properties === "object" &&
          typeof edge.properties.description === "string"
      )
    );

    return validEdges;
  }

  /**
   * Gets the stage ID from a stage name in the donor journey
   */
  static getStageIdFromName(journey: DonorJourney, stageName: string): string | null {
    const stage = journey.nodes.find((node) => node.label === stageName);
    return stage?.id || null;
  }

  /**
   * Gets the stage name from a stage ID in the donor journey
   */
  static getStageNameFromId(journey: DonorJourney, stageId: string): string | null {
    const stage = journey.nodes.find((node) => node.id === stageId);
    return stage?.label || null;
  }
}
