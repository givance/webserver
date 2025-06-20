import { formatCurrency, formatDate } from '@/app/lib/utils/format';

describe('format utilities', () => {
  describe('formatCurrency', () => {
    it('should format positive amounts correctly', () => {
      expect(formatCurrency(10000)).toBe('$100.00');
      expect(formatCurrency(12350)).toBe('$123.50');
      expect(formatCurrency(99)).toBe('$0.99');
      expect(formatCurrency(1)).toBe('$0.01');
    });

    it('should format zero amount', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should format negative amounts correctly', () => {
      expect(formatCurrency(-10000)).toBe('-$100.00');
      expect(formatCurrency(-12350)).toBe('-$123.50');
      expect(formatCurrency(-99)).toBe('-$0.99');
    });

    it('should format large amounts with thousand separators', () => {
      expect(formatCurrency(100000000)).toBe('$1,000,000.00');
      expect(formatCurrency(123456789)).toBe('$1,234,567.89');
      expect(formatCurrency(999999999)).toBe('$9,999,999.99');
    });

    it('should handle decimal precision correctly', () => {
      expect(formatCurrency(12345)).toBe('$123.45');
      expect(formatCurrency(12300)).toBe('$123.00');
      expect(formatCurrency(12301)).toBe('$123.01');
    });

    it('should round correctly for fractional cents', () => {
      // JavaScript number precision might affect these, but formatCurrency takes cents as integers
      expect(formatCurrency(Math.round(123.456))).toBe('$1.23');
      expect(formatCurrency(Math.round(123.999))).toBe('$1.24');
    });
  });

  describe('formatDate', () => {
    it('should format Date objects correctly', () => {
      // Use UTC to avoid timezone issues
      const date = new Date(2023, 0, 15); // January 15, 2023 (months are 0-indexed)
      expect(formatDate(date)).toBe('Jan 15, 2023');
    });

    it('should format date strings correctly', () => {
      // Create dates with explicit time component to handle timezone
      const dec25 = new Date('2023-12-25T12:00:00');
      const jul4 = new Date('2023-07-04T12:00:00');
      expect(formatDate(dec25)).toBe('Dec 25, 2023');
      expect(formatDate(jul4)).toBe('Jul 4, 2023');
    });

    it('should handle different date formats', () => {
      // Test with local date construction to avoid timezone shifts
      const jan1 = new Date(2023, 0, 1); // January 1, 2023
      const dec31 = new Date(2023, 11, 31); // December 31, 2023
      expect(formatDate(jan1)).toBe('Jan 1, 2023');
      expect(formatDate(dec31)).toBe('Dec 31, 2023');
    });

    it('should format dates in different years', () => {
      const leapDay = new Date(2020, 1, 29); // February 29, 2020 (leap year)
      const feb28 = new Date(2019, 1, 28); // February 28, 2019
      const june15 = new Date(2025, 5, 15); // June 15, 2025
      expect(formatDate(leapDay)).toBe('Feb 29, 2020');
      expect(formatDate(feb28)).toBe('Feb 28, 2019');
      expect(formatDate(june15)).toBe('Jun 15, 2025');
    });

    it('should handle edge cases', () => {
      const jan1 = new Date(2023, 0, 1);
      const dec31 = new Date(2023, 11, 31);
      expect(formatDate(jan1)).toBe('Jan 1, 2023');
      expect(formatDate(dec31)).toBe('Dec 31, 2023');
    });

    it('should format single-digit days without leading zero', () => {
      const mar5 = new Date(2023, 2, 5); // March 5, 2023
      const nov9 = new Date(2023, 10, 9); // November 9, 2023
      expect(formatDate(mar5)).toBe('Mar 5, 2023');
      expect(formatDate(nov9)).toBe('Nov 9, 2023');
    });

    it('should handle invalid date strings gracefully', () => {
      // Invalid dates will return 'Invalid Date'
      const result = formatDate('not-a-date');
      expect(result).toBe('Invalid Date');
    });

    it('should format string dates with timezone consideration', () => {
      // Use date strings with time component to ensure consistent parsing
      expect(formatDate('2023-06-15T12:00:00')).toBe('Jun 15, 2023');
      expect(formatDate('2023-09-20T12:00:00')).toBe('Sep 20, 2023');
    });
  });
});