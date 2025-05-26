/**
 * Utility functions for parsing JSON from AI responses that might contain extra text
 */

export interface ParseJsonOptions {
  /** Whether to log parsing attempts for debugging */
  debug?: boolean;
  /** Context identifier for logging */
  context?: string;
}

/**
 * Attempts to parse JSON from an AI response that might contain extra text
 * @param response The raw AI response
 * @param options Parsing options
 * @returns Parsed JSON object
 * @throws Error if JSON cannot be parsed
 */
export function parseJsonFromAiResponse<T = any>(response: string, options: ParseJsonOptions = {}): T {
  const { debug = false, context = "unknown" } = options;

  if (!response || typeof response !== "string") {
    throw new Error(`Invalid response: expected string, got ${typeof response}`);
  }

  const trimmedResponse = response.trim();

  if (debug) {
    console.log(`[${context}] Parsing JSON response:`, {
      length: trimmedResponse.length,
      preview: trimmedResponse.substring(0, 100) + "...",
    });
  }

  // Strategy 1: Try parsing the response as-is
  try {
    return JSON.parse(trimmedResponse);
  } catch (error) {
    if (debug) {
      console.log(`[${context}] Direct parsing failed:`, error instanceof Error ? error.message : error);
    }
  }

  // Strategy 2: Extract JSON object from response
  const jsonStart = trimmedResponse.indexOf("{");
  const jsonEnd = trimmedResponse.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const extractedJson = trimmedResponse.substring(jsonStart, jsonEnd + 1);

    if (debug) {
      console.log(`[${context}] Extracted JSON:`, {
        originalLength: trimmedResponse.length,
        extractedLength: extractedJson.length,
        preview: extractedJson.substring(0, 100) + "...",
      });
    }

    try {
      return JSON.parse(extractedJson);
    } catch (error) {
      if (debug) {
        console.log(`[${context}] Extracted JSON parsing failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  // Strategy 3: Try to find JSON array
  const arrayStart = trimmedResponse.indexOf("[");
  const arrayEnd = trimmedResponse.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const extractedArray = trimmedResponse.substring(arrayStart, arrayEnd + 1);

    if (debug) {
      console.log(`[${context}] Extracted JSON array:`, {
        originalLength: trimmedResponse.length,
        extractedLength: extractedArray.length,
        preview: extractedArray.substring(0, 100) + "...",
      });
    }

    try {
      return JSON.parse(extractedArray);
    } catch (error) {
      if (debug) {
        console.log(`[${context}] Extracted array parsing failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  // Strategy 4: Try to clean up common formatting issues
  let cleanedResponse = trimmedResponse;

  // Remove markdown code blocks
  cleanedResponse = cleanedResponse.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
  cleanedResponse = cleanedResponse.replace(/```\s*/g, "");

  // Remove common prefixes
  cleanedResponse = cleanedResponse.replace(/^(JSON|Response|Output):\s*/i, "");
  cleanedResponse = cleanedResponse.replace(/^Here's the.*?:\s*/i, "");

  if (cleanedResponse !== trimmedResponse) {
    if (debug) {
      console.log(`[${context}] Cleaned response:`, {
        originalLength: trimmedResponse.length,
        cleanedLength: cleanedResponse.length,
        preview: cleanedResponse.substring(0, 100) + "...",
      });
    }

    try {
      return JSON.parse(cleanedResponse);
    } catch (error) {
      if (debug) {
        console.log(`[${context}] Cleaned response parsing failed:`, error instanceof Error ? error.message : error);
      }
    }
  }

  // If all strategies fail, throw a detailed error
  throw new Error(
    `Failed to parse JSON from AI response. ` +
      `Response length: ${trimmedResponse.length}. ` +
      `Preview: ${trimmedResponse.substring(0, 200)}...`
  );
}

/**
 * Validates that a parsed object has the expected structure
 * @param obj The parsed object
 * @param validator A function that returns true if the object is valid
 * @param errorMessage Custom error message if validation fails
 * @returns The validated object
 * @throws Error if validation fails
 */
export function validateParsedJson<T>(
  obj: any,
  validator: (obj: any) => obj is T,
  errorMessage: string = "Object does not match expected structure"
): T {
  if (!validator(obj)) {
    throw new Error(`${errorMessage}. Got: ${JSON.stringify(obj).substring(0, 200)}...`);
  }
  return obj;
}
