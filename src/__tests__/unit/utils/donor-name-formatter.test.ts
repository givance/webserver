import { formatDonorName, getDonorSalutation, type DonorNameFields } from '@/app/lib/utils/donor-name-formatter';

describe('donor-name-formatter', () => {
  describe('formatDonorName', () => {
    it('should prioritize displayName when available', () => {
      const donor: DonorNameFields = {
        displayName: 'John and Jane Smith',
        hisFirstName: 'John',
        hisLastName: 'Smith',
        herFirstName: 'Jane',
        herLastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('John and Jane Smith');
    });

    it('should trim whitespace from displayName', () => {
      const donor: DonorNameFields = {
        displayName: '  John Smith  ',
      };

      expect(formatDonorName(donor)).toBe('John Smith');
    });

    it('should format couple names when both his and her names exist', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Mr.',
        hisFirstName: 'John',
        hisLastName: 'Smith',
        herTitle: 'Mrs.',
        herFirstName: 'Jane',
        herLastName: 'Smith',
        isCouple: true,
      };

      expect(formatDonorName(donor)).toBe('Mr. John Smith and Mrs. Jane Smith');
    });

    it('should format couple names with initials', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Dr.',
        hisFirstName: 'John',
        hisInitial: 'A',
        hisLastName: 'Smith',
        herTitle: 'Dr.',
        herFirstName: 'Jane',
        herInitial: 'B.',
        herLastName: 'Smith',
        isCouple: true,
      };

      expect(formatDonorName(donor)).toBe('Dr. John A. Smith and Dr. Jane B. Smith');
    });

    it('should format single person when only his name exists', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Mr.',
        hisFirstName: 'John',
        hisLastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('Mr. John Smith');
    });

    it('should format single person when only her name exists', () => {
      const donor: DonorNameFields = {
        herTitle: 'Ms.',
        herFirstName: 'Jane',
        herLastName: 'Doe',
      };

      expect(formatDonorName(donor)).toBe('Ms. Jane Doe');
    });

    it('should handle missing title gracefully', () => {
      const donor: DonorNameFields = {
        hisFirstName: 'John',
        hisLastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('John Smith');
    });

    it('should handle missing last name', () => {
      const donor: DonorNameFields = {
        hisFirstName: 'John',
      };

      expect(formatDonorName(donor)).toBe('John');
    });

    it('should fall back to deprecated firstName/lastName fields', () => {
      const donor: DonorNameFields = {
        firstName: 'John',
        lastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('John Smith');
    });

    it('should handle only deprecated firstName', () => {
      const donor: DonorNameFields = {
        firstName: 'John',
      };

      expect(formatDonorName(donor)).toBe('John');
    });

    it('should handle only deprecated lastName', () => {
      const donor: DonorNameFields = {
        lastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('Smith');
    });

    it('should return "Unknown Donor" when no name fields are available', () => {
      const donor: DonorNameFields = {};

      expect(formatDonorName(donor)).toBe('Unknown Donor');
    });

    it('should handle null values gracefully', () => {
      const donor: DonorNameFields = {
        displayName: null,
        hisFirstName: null,
        hisLastName: null,
        firstName: null,
        lastName: null,
      };

      expect(formatDonorName(donor)).toBe('Unknown Donor');
    });

    it('should handle empty strings as no value', () => {
      const donor: DonorNameFields = {
        displayName: '',
        hisFirstName: '',
        hisLastName: '',
        firstName: '',
        lastName: '',
      };

      expect(formatDonorName(donor)).toBe('Unknown Donor');
    });

    it('should add period to initial if missing', () => {
      const donor: DonorNameFields = {
        hisFirstName: 'John',
        hisInitial: 'A',
        hisLastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('John A. Smith');
    });

    it('should not add extra period if initial already has one', () => {
      const donor: DonorNameFields = {
        hisFirstName: 'John',
        hisInitial: 'A.',
        hisLastName: 'Smith',
      };

      expect(formatDonorName(donor)).toBe('John A. Smith');
    });
  });

  describe('getDonorSalutation', () => {
    it('should use displayName when available', () => {
      const donor: DonorNameFields = {
        displayName: 'John and Jane Smith',
        hisFirstName: 'John',
        hisLastName: 'Smith',
      };

      expect(getDonorSalutation(donor)).toBe('Dear John and Jane Smith');
    });

    it('should format couple salutation properly', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Mr.',
        hisFirstName: 'John',
        hisLastName: 'Smith',
        herTitle: 'Mrs.',
        herFirstName: 'Jane',
        herLastName: 'Smith',
        isCouple: true,
      };

      expect(getDonorSalutation(donor)).toBe('Dear Mr. John Smith and Mrs. Jane Smith');
    });

    it('should use title and last name for formal salutation', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Dr.',
        hisFirstName: 'John',
        hisLastName: 'Smith',
      };

      expect(getDonorSalutation(donor)).toBe('Dear Dr. Smith');
    });

    it('should use first name when no title is available', () => {
      const donor: DonorNameFields = {
        hisFirstName: 'John',
        hisLastName: 'Smith',
      };

      expect(getDonorSalutation(donor)).toBe('Dear John');
    });

    it('should handle her-only records', () => {
      const donor: DonorNameFields = {
        herTitle: 'Ms.',
        herFirstName: 'Jane',
        herLastName: 'Doe',
      };

      expect(getDonorSalutation(donor)).toBe('Dear Ms. Doe');
    });

    it('should fall back to deprecated firstName field', () => {
      const donor: DonorNameFields = {
        firstName: 'John',
      };

      expect(getDonorSalutation(donor)).toBe('Dear John');
    });

    it('should return "Dear Friend" when no suitable name is found', () => {
      const donor: DonorNameFields = {};

      expect(getDonorSalutation(donor)).toBe('Dear Friend');
    });

    it('should handle null and empty values gracefully', () => {
      const donor: DonorNameFields = {
        displayName: '',
        hisFirstName: null,
        firstName: '',
      };

      expect(getDonorSalutation(donor)).toBe('Dear Friend');
    });

    it('should trim whitespace from names in salutation', () => {
      const donor: DonorNameFields = {
        displayName: '  John Smith  ',
      };

      expect(getDonorSalutation(donor)).toBe('Dear John Smith');
    });

    it('should prefer individual name components over deprecated fields for couples', () => {
      const donor: DonorNameFields = {
        hisTitle: 'Mr.',
        hisFirstName: 'John',
        hisLastName: 'Smith',
        herTitle: 'Mrs.',
        herFirstName: 'Jane',
        herLastName: 'Smith',
        isCouple: true,
        firstName: 'Robert',
        lastName: 'Johnson',
      };

      expect(getDonorSalutation(donor)).toBe('Dear Mr. John Smith and Mrs. Jane Smith');
    });
  });
});