// Mock DOMPurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: jest.fn((html) => {
      // Simple mock that removes script tags
      return html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    }),
  },
}));

import { sanitizeHtml, stripHtml } from '@/app/lib/utils/sanitize-html';

describe('sanitize-html', () => {
  describe('stripHtml', () => {
    it('should strip HTML tags and preserve text', () => {
      expect(stripHtml('<p>Hello</p>')).toBe('Hello');
      expect(stripHtml('<div>Test <strong>bold</strong></div>')).toBe('Test bold');
      expect(stripHtml('Plain text')).toBe('Plain text');
    });

    it('should handle nested tags', () => {
      expect(stripHtml('<div><p><strong>Nested</strong> <em>content</em></p></div>'))
        .toBe('Nested content');
    });

    it('should handle empty tags', () => {
      expect(stripHtml('<p></p>')).toBe('');
      expect(stripHtml('<div><span></span></div>')).toBe('');
    });

    it('should handle line breaks', () => {
      // The br tag is stripped but doesn't add a space
      expect(stripHtml('<p>Line1<br>Line2</p>')).toBe('Line1Line2');
      expect(stripHtml('<p>Line1<br/>Line2</p>')).toBe('Line1Line2');
    });

    it('should handle HTML entities', () => {
      expect(stripHtml('<p>&amp; &lt; &gt;</p>')).toBe('& < >');
      expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    });
  });

  describe('sanitizeHtml', () => {
    // Since we're in jsdom environment, window is always defined
    // So sanitizeHtml will always go through the client-side path

    it('should sanitize dangerous HTML', () => {
      const html = '<script>alert("xss")</script><p>Hello</p>';
      const result = sanitizeHtml(html);
      
      // Our mock removes script tags
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should handle empty input', () => {
      const result = sanitizeHtml('');
      expect(result).toBe('');
    });

    it('should handle plain text', () => {
      const plainText = 'Just plain text';
      const result = sanitizeHtml(plainText);
      expect(result).toBe(plainText);
    });

    it('should preserve allowed tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = sanitizeHtml(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
    });
  });
});