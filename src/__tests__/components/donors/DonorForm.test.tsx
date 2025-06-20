import React from "react";
import { render, screen, waitFor } from "@/__tests__/utils/test-utils";
import userEvent from "@testing-library/user-event";
import AddDonorPage from "@/app/(app)/donors/add/page";

// Mock the hooks
jest.mock("@/app/hooks/use-donors");

// Get the mocked router from setup
const mockRouter = require("next/navigation").useRouter();

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("DonorForm (Add Donor Page)", () => {
  const mockUseDonors = {
    createDonor: jest.fn(),
    isCreating: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
    require("@/app/hooks/use-donors").useDonors.mockReturnValue(mockUseDonors);
  });

  it("renders the add donor form", () => {
    render(<AddDonorPage />);

    expect(screen.getByText("Add New Donor")).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/postal code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/country/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("validates required fields", async () => {
    const user = userEvent.setup();
    render(<AddDonorPage />);

    // Submit without filling required fields
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Check validation messages
    await waitFor(() => {
      expect(screen.getByText("First name must be at least 2 characters")).toBeInTheDocument();
      expect(screen.getByText("Last name must be at least 2 characters")).toBeInTheDocument();
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });
  });

  it("validates email format", async () => {
    const user = userEvent.setup();
    render(<AddDonorPage />);

    // Fill in invalid email
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, "invalid-email");

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Check validation message
    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });
  });

  it("successfully creates a donor", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockResolvedValueOnce({ id: 123 });

    render(<AddDonorPage />);

    // Fill in required fields
    await user.type(screen.getByLabelText(/first name/i), "John");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "john@example.com");

    // Fill in optional fields
    await user.type(screen.getByLabelText(/phone/i), "+1234567890");
    await user.type(screen.getByLabelText(/address/i), "123 Main St");
    await user.type(screen.getByLabelText(/city/i), "New York");
    await user.type(screen.getByLabelText(/state/i), "NY");
    await user.type(screen.getByLabelText(/postal code/i), "10001");
    await user.type(screen.getByLabelText(/country/i), "USA");
    await user.type(screen.getByLabelText(/notes/i), "Important donor");

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Verify createDonor was called with correct data
    await waitFor(() => {
      expect(mockUseDonors.createDonor).toHaveBeenCalledWith({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "+1234567890",
        address: "123 Main St",
        city: "New York",
        state: "NY",
        postalCode: "10001",
        country: "USA",
        gender: null,
        notes: "Important donor",
        isAnonymous: false,
        isOrganization: false,
        organizationName: "",
      });
    });

    // Verify redirect
    expect(mockRouter.push).toHaveBeenCalledWith("/donors");
  });

  it("handles gender selection", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockResolvedValueOnce({ id: 123 });

    render(<AddDonorPage />);

    // Fill required fields
    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    // Select gender
    const genderSelect = screen.getByRole("combobox", { name: /gender/i });
    await user.click(genderSelect);
    const femaleOption = screen.getByRole("option", { name: /female/i });
    await user.click(femaleOption);

    // Submit
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Verify gender was included
    await waitFor(() => {
      expect(mockUseDonors.createDonor).toHaveBeenCalledWith(
        expect.objectContaining({
          gender: "female",
        })
      );
    });
  });

  it("handles anonymous donor checkbox", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockResolvedValueOnce({ id: 123 });

    render(<AddDonorPage />);

    // Fill required fields
    await user.type(screen.getByLabelText(/first name/i), "Anonymous");
    await user.type(screen.getByLabelText(/last name/i), "Donor");
    await user.type(screen.getByLabelText(/email/i), "anon@example.com");

    // Check anonymous checkbox
    const anonymousCheckbox = screen.getByRole("checkbox", { name: /anonymous donor/i });
    await user.click(anonymousCheckbox);

    // Submit
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Verify anonymous flag was set
    await waitFor(() => {
      expect(mockUseDonors.createDonor).toHaveBeenCalledWith(
        expect.objectContaining({
          isAnonymous: true,
        })
      );
    });
  });

  it("handles organization donor", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockResolvedValueOnce({ id: 123 });

    render(<AddDonorPage />);

    // Fill required fields
    await user.type(screen.getByLabelText(/first name/i), "Contact");
    await user.type(screen.getByLabelText(/last name/i), "Person");
    await user.type(screen.getByLabelText(/email/i), "contact@company.com");

    // Check organization checkbox
    const orgCheckbox = screen.getByRole("checkbox", { name: /organization/i });
    await user.click(orgCheckbox);

    // Organization name field should appear
    const orgNameInput = screen.getByLabelText(/organization name/i);
    await user.type(orgNameInput, "Acme Corporation");

    // Submit
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Verify organization data was included
    await waitFor(() => {
      expect(mockUseDonors.createDonor).toHaveBeenCalledWith(
        expect.objectContaining({
          isOrganization: true,
          organizationName: "Acme Corporation",
        })
      );
    });
  });

  it("displays error when creation fails", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockResolvedValueOnce(null);

    render(<AddDonorPage />);

    // Fill required fields
    await user.type(screen.getByLabelText(/first name/i), "John");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "john@example.com");

    // Submit
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Check error message
    await waitFor(() => {
      expect(screen.getByText("Failed to create donor. Please try again.")).toBeInTheDocument();
    });

    // Should not redirect
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("displays error from exception", async () => {
    const user = userEvent.setup();
    mockUseDonors.createDonor.mockRejectedValueOnce(new Error("API Error"));

    render(<AddDonorPage />);

    // Fill required fields
    await user.type(screen.getByLabelText(/first name/i), "John");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "john@example.com");

    // Submit
    const submitButton = screen.getByRole("button", { name: /create donor/i });
    await user.click(submitButton);

    // Check error message
    await waitFor(() => {
      expect(screen.getByText("API Error")).toBeInTheDocument();
    });
  });

  it("disables submit button while creating", async () => {
    const user = userEvent.setup();
    
    // Set isCreating to true
    mockUseDonors.isCreating = true;
    render(<AddDonorPage />);

    const submitButton = screen.getByRole("button", { name: /creating/i });
    expect(submitButton).toBeDisabled();
  });

  it("navigates back to donors list", async () => {
    const user = userEvent.setup();
    render(<AddDonorPage />);

    const backButton = screen.getByRole("link", { href: "/donors" });
    expect(backButton).toBeInTheDocument();
    expect(backButton.getAttribute("href")).toBe("/donors");
  });
});