// Mock all page components to prevent React rendering issues
jest.mock("@/app/(app)/donors/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/donors/[id]/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/donors/add/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/campaign/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/campaign/components/CampaignSteps", () => ({
  CampaignSteps: () => null,
}));

jest.mock("@/app/(app)/campaign/results/[sessionId]/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/projects/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/projects/[id]/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/app/(app)/projects/add/page", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/donors/DeleteDonorDialog", () => ({
  DeleteDonorDialog: () => null,
}));

jest.mock("@/components/campaign/CampaignButton", () => ({
  CampaignButton: () => null,
}));