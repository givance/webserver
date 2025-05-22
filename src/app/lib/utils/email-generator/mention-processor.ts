import { getProjectById } from "../../data/projects";

/**
 * Interface representing a parsed project mention
 */
interface ProjectMention {
  mentionText: string; // The original mention text like "@[School Renovation](123)"
  projectId: number;
  projectName: string;
}

/**
 * Parses project mentions from instruction text using react-mentions format
 * @param instruction - The instruction text containing mentions in format "@[ProjectName](projectId)"
 * @returns Array of parsed project mentions
 */
function parseProjectMentions(instruction: string): ProjectMention[] {
  // Regex to match @[display](id) format from react-mentions
  const mentionRegex = /@\[([^\]]+)\]\((\d+)\)/g;
  const mentions: ProjectMention[] = [];
  let match;

  while ((match = mentionRegex.exec(instruction)) !== null) {
    mentions.push({
      mentionText: match[0], // Full match like "@[School Renovation](123)"
      projectName: match[1], // Display name like "School Renovation"
      projectId: parseInt(match[2]), // Project ID like 123
    });
  }

  return mentions;
}

/**
 * Fetches project details for mentioned projects and replaces mentions with enhanced descriptions
 * @param instruction - The original instruction with project mentions
 * @param organizationId - The organization ID to verify project ownership
 * @returns Enhanced instruction with project details instead of mentions
 */
export async function processProjectMentions(instruction: string, organizationId: string): Promise<string> {
  const mentions = parseProjectMentions(instruction);

  if (mentions.length === 0) {
    return instruction;
  }

  let processedInstruction = instruction;

  // Fetch project details for all mentions
  for (const mention of mentions) {
    try {
      const project = await getProjectById(mention.projectId);

      // Verify project exists and belongs to the organization
      if (project && project.organizationId === organizationId) {
        // Create enhanced description of the project
        let projectDescription = `the "${project.name}" project`;

        if (project.description) {
          projectDescription += ` (${project.description})`;
        }

        if (project.goal) {
          const goalAmount = (project.goal / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          });
          projectDescription += ` with a goal of ${goalAmount}`;
        }

        if (project.tags && project.tags.length > 0) {
          projectDescription += ` (tags: ${project.tags.join(", ")})`;
        }

        // Replace the mention with the enhanced description
        processedInstruction = processedInstruction.replace(mention.mentionText, projectDescription);
      } else {
        // If project not found or doesn't belong to org, replace with just the name
        processedInstruction = processedInstruction.replace(
          mention.mentionText,
          `the "${mention.projectName}" project`
        );
      }
    } catch (error) {
      console.error(`Error fetching project ${mention.projectId}:`, error);
      // Fallback to just the project name if there's an error
      processedInstruction = processedInstruction.replace(mention.mentionText, `the "${mention.projectName}" project`);
    }
  }

  return processedInstruction;
}

/**
 * Extracts project information for use in prompts without replacing the original instruction
 * @param instruction - The original instruction with project mentions
 * @param organizationId - The organization ID to verify project ownership
 * @returns Object containing original instruction and project context information
 */
export async function extractProjectContext(
  instruction: string,
  organizationId: string
): Promise<{
  originalInstruction: string;
  processedInstruction: string;
  projectContext: string;
}> {
  const mentions = parseProjectMentions(instruction);

  if (mentions.length === 0) {
    return {
      originalInstruction: instruction,
      processedInstruction: instruction,
      projectContext: "",
    };
  }

  const processedInstruction = await processProjectMentions(instruction, organizationId);
  const projectDetails: string[] = [];

  // Fetch detailed project information for context
  for (const mention of mentions) {
    try {
      const project = await getProjectById(mention.projectId);

      if (project && project.organizationId === organizationId) {
        let detail = `- ${project.name}`;
        if (project.description) {
          detail += `: ${project.description}`;
        }
        if (project.goal) {
          const goalAmount = (project.goal / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          });
          detail += ` (Goal: ${goalAmount})`;
        }
        if (project.tags && project.tags.length > 0) {
          detail += ` [Tags: ${project.tags.join(", ")}]`;
        }
        if (!project.active) {
          detail += " (Completed)";
        }
        projectDetails.push(detail);
      }
    } catch (error) {
      console.error(`Error fetching project ${mention.projectId}:`, error);
    }
  }

  const projectContext = projectDetails.length > 0 ? `\n\nMentioned Projects:\n${projectDetails.join("\n")}` : "";

  return {
    originalInstruction: instruction,
    processedInstruction,
    projectContext,
  };
}
