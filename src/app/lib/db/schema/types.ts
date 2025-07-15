/**
 * Type for donor notes array items
 */
export type DonorNote = {
  createdAt: string;
  createdBy: string; // User ID who created the note
  content: string;
};
