import { createHtmlEmail, createTextEmail } from "@/app/lib/utils/email-tracking/content-processor";

describe("Email Header Encoding", () => {
  describe("createHtmlEmail", () => {
    it("should not encode ASCII-only subject lines", () => {
      const result = createHtmlEmail(
        "test@example.com",
        "Simple subject line",
        "<p>Hello world</p>",
        "Hello world"
      );

      expect(result).toContain("Subject: Simple subject line");
      expect(result).not.toContain("=?UTF-8?B?");
    });

    it("should encode subject lines with smart quotes using RFC 2047", () => {
      // Using Unicode escape sequences to avoid parser issues
      const subject = "Here\u2019s a subject with \u201csmart quotes\u201d";
      const result = createHtmlEmail(
        "test@example.com",
        subject,
        "<p>Hello world</p>",
        "Hello world"
      );

      // Should contain encoded subject
      expect(result).toContain("=?UTF-8?B?");
      expect(result).toContain("Subject: =?UTF-8?B?");
      // Should not contain the raw smart quotes in headers
      const headers = result.split('\n\n')[0];
      expect(headers).not.toContain("\u201c");
      expect(headers).not.toContain("\u2019");
    });

    it("should encode subject lines with various Unicode characters", () => {
      const subjects = [
        "Émojis and àccénts",
        "中文测试",
        "🎉 Celebration time!",
        "Café münü"
      ];

      subjects.forEach(subject => {
        const result = createHtmlEmail(
          "test@example.com",
          subject,
          "<p>Hello world</p>",
          "Hello world"
        );

        expect(result).toContain("=?UTF-8?B?");
        expect(result).toContain("Subject: =?UTF-8?B?");
      });
    });

    it("should preserve original subject in HTML title", () => {
      const subject = "Here\u2019s a test with \u201cquotes\u201d";
      const result = createHtmlEmail(
        "test@example.com",
        subject,
        "<p>Hello world</p>",
        "Hello world"
      );

      // The HTML title should contain the original subject
      expect(result).toContain(`<title>${subject}</title>`);
    });

    it("should include sender in From header when provided", () => {
      const result = createHtmlEmail(
        "recipient@example.com",
        "Test subject",
        "<p>Hello world</p>",
        "Hello world",
        "sender@example.com"
      );

      expect(result).toContain("From: sender@example.com");
    });
  });

  describe("createTextEmail", () => {
    it("should not encode ASCII-only subject lines", () => {
      const result = createTextEmail(
        "test@example.com",
        "Simple subject line",
        "Hello world"
      );

      expect(result).toContain("Subject: Simple subject line");
      expect(result).not.toContain("=?UTF-8?B?");
    });

    it("should encode subject lines with smart quotes using RFC 2047", () => {
      const subject = "Here\u2019s a subject with \u201csmart quotes\u201d";
      const result = createTextEmail(
        "test@example.com",
        subject,
        "Hello world"
      );

      expect(result).toContain("=?UTF-8?B?");
      expect(result).toContain("Subject: =?UTF-8?B?");
    });
  });

  describe("RFC 2047 Encoding Function", () => {
    it("should properly decode back to original text", () => {
      const originalSubject = "Here\u2019s a test with \u201csmart quotes\u201d and \u2018apostrophes\u2019";
      const result = createHtmlEmail(
        "test@example.com",
        originalSubject,
        "<p>Hello</p>",
        "Hello"
      );

      // Extract the encoded subject from the headers
      const subjectMatch = result.match(/Subject: (=\?UTF-8\?B\?[^?]+\?=)/);
      expect(subjectMatch).toBeTruthy();
      
      if (subjectMatch) {
        const encodedSubject = subjectMatch[1];
        
        // Decode manually to verify it matches original
        const base64Part = encodedSubject.match(/=\?UTF-8\?B\?([^?]+)\?=/);
        expect(base64Part).toBeTruthy();
        
        if (base64Part) {
          const decoded = Buffer.from(base64Part[1], 'base64').toString('utf8');
          expect(decoded).toBe(originalSubject);
        }
      }
    });
  });
});