import { formatDonorName, getDonorSalutation } from "@/app/lib/utils/donor-name-formatter";

describe("Donor Utilities", () => {
  describe("formatDonorName", () => {
    it("should use displayName when available", () => {
      const donor = {
        displayName: "Mr. & Mrs. Smith",
      };
      
      expect(formatDonorName(donor)).toBe("Mr. & Mrs. Smith");
    });

    it("should format couple names from his/her fields", () => {
      const donor = {
        hisTitle: "Mr.",
        hisFirstName: "John",
        hisLastName: "Smith",
        herTitle: "Mrs.",
        herFirstName: "Jane",
        herLastName: "Smith",
        isCouple: true,
      };
      
      expect(formatDonorName(donor)).toBe("Mr. John Smith and Mrs. Jane Smith");
    });

    it("should format single person from his fields", () => {
      const donor = {
        hisTitle: "Dr.",
        hisFirstName: "John",
        hisInitial: "Q",
        hisLastName: "Smith",
      };
      
      expect(formatDonorName(donor)).toBe("Dr. John Q. Smith");
    });

    it("should format single person from her fields", () => {
      const donor = {
        herTitle: "Ms.",
        herFirstName: "Jane",
        herLastName: "Doe",
      };
      
      expect(formatDonorName(donor)).toBe("Ms. Jane Doe");
    });

    it("should fall back to deprecated firstName/lastName", () => {
      const donor = {
        firstName: "John",
        lastName: "Doe",
      };
      
      expect(formatDonorName(donor)).toBe("John Doe");
    });

    it("should return Unknown Donor when no name fields exist", () => {
      const donor = {};
      
      expect(formatDonorName(donor)).toBe("Unknown Donor");
    });

    it("should handle initial with period", () => {
      const donor = {
        hisFirstName: "John",
        hisInitial: "Q.",
        hisLastName: "Smith",
      };
      
      expect(formatDonorName(donor)).toBe("John Q. Smith");
    });

    it("should add period to initial without one", () => {
      const donor = {
        hisFirstName: "John",
        hisInitial: "Q",
        hisLastName: "Smith",
      };
      
      expect(formatDonorName(donor)).toBe("John Q. Smith");
    });
  });

  describe("getDonorSalutation", () => {
    it("should use displayName for salutation", () => {
      const donor = {
        displayName: "John and Jane",
      };
      
      expect(getDonorSalutation(donor)).toBe("Dear John and Jane");
    });

    it("should format couple salutation", () => {
      const donor = {
        hisTitle: "Mr.",
        hisFirstName: "John",
        hisLastName: "Smith",
        herTitle: "Mrs.",
        herFirstName: "Jane",
        herLastName: "Smith",
        isCouple: true,
      };
      
      expect(getDonorSalutation(donor)).toBe("Dear Mr. John Smith and Mrs. Jane Smith");
    });

    it("should use title and last name for formal salutation", () => {
      const donor = {
        hisTitle: "Dr.",
        hisFirstName: "John",
        hisLastName: "Smith",
      };
      
      expect(getDonorSalutation(donor)).toBe("Dear Dr. Smith");
    });

    it("should use first name when no title available", () => {
      const donor = {
        hisFirstName: "John",
        hisLastName: "Smith",
      };
      
      expect(getDonorSalutation(donor)).toBe("Dear John");
    });

    it("should fall back to deprecated firstName", () => {
      const donor = {
        firstName: "John",
      };
      
      expect(getDonorSalutation(donor)).toBe("Dear John");
    });

    it("should return Dear Friend when no name available", () => {
      const donor = {};
      
      expect(getDonorSalutation(donor)).toBe("Dear Friend");
    });
  });
});