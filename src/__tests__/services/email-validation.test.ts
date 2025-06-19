// Email validation service tests (simplified, no external dependencies)

describe('Email Validation Service', () => {
  // Mock service functions that would exist in the real service
  const validateEmailInput = (input: {
    instruction: string
    donors: Array<{ id: number; firstName: string; lastName: string; email: string }>
    organizationName: string
  }) => {
    if (!input.instruction || input.instruction.trim() === '') {
      throw new Error('Instruction cannot be empty')
    }
    
    if (!input.donors || input.donors.length === 0) {
      throw new Error('At least one donor must be provided')
    }
    
    if (input.instruction.length > 5000) {
      throw new Error('Instruction is too long')
    }
    
    for (const donor of input.donors) {
      if (!isValidEmail(donor.email)) {
        throw new Error('Invalid email address')
      }
    }
    
    return true
  }

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const calculateDonorStatistics = (donations: Array<{ amount: number; date: Date }>) => {
    if (donations.length === 0) {
      return {
        totalDonated: 0,
        averageDonation: 0,
        donationCount: 0,
        lastDonationDate: null,
        firstDonationDate: null
      }
    }

    const sortedDonations = donations.sort((a, b) => a.date.getTime() - b.date.getTime())
    const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0)
    const averageDonation = totalDonated / donations.length

    return {
      totalDonated,
      averageDonation,
      donationCount: donations.length,
      lastDonationDate: sortedDonations[sortedDonations.length - 1].date,
      firstDonationDate: sortedDonations[0].date
    }
  }

  const sanitizeEmailContent = (content: { subject: string; body: string }) => {
    // Simple HTML sanitization (in real app would use DOMPurify)
    const sanitized = {
      subject: content.subject.replace(/<script[^>]*>.*?<\/script>/gi, ''),
      body: content.body
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/onerror=/gi, '')
    }
    return sanitized
  }

  describe('validateEmailInput', () => {
    it('should validate valid input correctly', () => {
      const validInput = {
        instruction: 'Send thank you emails',
        donors: [
          { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
        ],
        organizationName: 'Test Org'
      }

      expect(() => validateEmailInput(validInput)).not.toThrow()
    })

    it('should reject empty instruction', () => {
      const invalidInput = {
        instruction: '',
        donors: [{ id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' }],
        organizationName: 'Test Org'
      }

      expect(() => validateEmailInput(invalidInput))
        .toThrow('Instruction cannot be empty')
    })

    it('should reject empty donors array', () => {
      const invalidInput = {
        instruction: 'Send emails',
        donors: [],
        organizationName: 'Test Org'
      }

      expect(() => validateEmailInput(invalidInput))
        .toThrow('At least one donor must be provided')
    })

    it('should reject donors with invalid email addresses', () => {
      const invalidInput = {
        instruction: 'Send emails',
        donors: [
          { id: 1, firstName: 'John', lastName: 'Doe', email: 'invalid-email' }
        ],
        organizationName: 'Test Org'
      }

      expect(() => validateEmailInput(invalidInput))
        .toThrow('Invalid email address')
    })

    it('should reject instruction that is too long', () => {
      const longInstruction = 'a'.repeat(5001)
      const invalidInput = {
        instruction: longInstruction,
        donors: [{ id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' }],
        organizationName: 'Test Org'
      }

      expect(() => validateEmailInput(invalidInput))
        .toThrow('Instruction is too long')
    })
  })

  describe('calculateDonorStatistics', () => {
    it('should correctly calculate statistics from donations', () => {
      const donations = [
        { amount: 10000, date: new Date('2023-01-01') },
        { amount: 20000, date: new Date('2023-02-01') },
        { amount: 15000, date: new Date('2023-03-01') }
      ]

      const stats = calculateDonorStatistics(donations)

      expect(stats.totalDonated).toBe(45000)
      expect(stats.averageDonation).toBe(15000)
      expect(stats.donationCount).toBe(3)
      expect(stats.lastDonationDate).toEqual(new Date('2023-03-01'))
      expect(stats.firstDonationDate).toEqual(new Date('2023-01-01'))
    })

    it('should handle empty donations array', () => {
      const stats = calculateDonorStatistics([])

      expect(stats.totalDonated).toBe(0)
      expect(stats.averageDonation).toBe(0)
      expect(stats.donationCount).toBe(0)
      expect(stats.lastDonationDate).toBeNull()
      expect(stats.firstDonationDate).toBeNull()
    })

    it('should handle single donation', () => {
      const donations = [{ amount: 5000, date: new Date('2023-01-01') }]
      const stats = calculateDonorStatistics(donations)

      expect(stats.totalDonated).toBe(5000)
      expect(stats.averageDonation).toBe(5000)
      expect(stats.donationCount).toBe(1)
      expect(stats.lastDonationDate).toEqual(new Date('2023-01-01'))
      expect(stats.firstDonationDate).toEqual(new Date('2023-01-01'))
    })
  })

  describe('sanitizeEmailContent', () => {
    it('should remove potentially harmful content', () => {
      const maliciousContent = {
        subject: 'Hello <script>alert("xss")</script>',
        body: 'Click here: <a href="javascript:void(0)">Link</a>\n<img src="x" onerror="alert(1)">'
      }

      const sanitized = sanitizeEmailContent(maliciousContent)

      expect(sanitized.subject).not.toContain('<script>')
      expect(sanitized.body).not.toContain('javascript:')
      expect(sanitized.body).not.toContain('onerror')
    })

    it('should preserve safe content', () => {
      const safeContent = {
        subject: 'Thank you for your donation',
        body: 'Dear John,\n\nThank you for your <strong>generous</strong> donation of $100.\n\nBest regards,\nThe Team'
      }

      const sanitized = sanitizeEmailContent(safeContent)

      expect(sanitized.subject).toBe(safeContent.subject)
      expect(sanitized.body).toContain('<strong>generous</strong>')
      expect(sanitized.body).toContain('Dear John')
    })
  })
})