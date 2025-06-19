// Simple utility tests that don't require external dependencies

describe('Basic utility functions', () => {
  describe('String utilities', () => {
    const capitalize = (str: string): string => {
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    }

    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
      expect(capitalize('WORLD')).toBe('World')
      expect(capitalize('tESt')).toBe('Test')
    })

    it('should handle edge cases', () => {
      expect(capitalize('')).toBe('')
      expect(capitalize('a')).toBe('A')
      expect(capitalize('A')).toBe('A')
    })
  })

  describe('Number utilities', () => {
    const formatCurrency = (cents: number): string => {
      return `$${(cents / 100).toFixed(2)}`
    }

    it('should format cents to currency', () => {
      expect(formatCurrency(1000)).toBe('$10.00')
      expect(formatCurrency(2550)).toBe('$25.50')
      expect(formatCurrency(99)).toBe('$0.99')
    })

    it('should handle zero and negative values', () => {
      expect(formatCurrency(0)).toBe('$0.00')
      expect(formatCurrency(-1000)).toBe('$-10.00')
    })
  })

  describe('Array utilities', () => {
    const chunk = <T>(array: T[], size: number): T[][] => {
      const chunks: T[][] = []
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
      }
      return chunks
    }

    it('should chunk arrays correctly', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
      expect(chunk(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
      expect(chunk([1, 2, 3, 4], 4)).toEqual([[1, 2, 3, 4]])
    })

    it('should handle edge cases', () => {
      expect(chunk([], 2)).toEqual([])
      expect(chunk([1], 5)).toEqual([[1]])
    })
  })

  describe('Date utilities', () => {
    const isToday = (date: Date): boolean => {
      const today = new Date()
      return date.toDateString() === today.toDateString()
    }

    it('should identify today correctly', () => {
      const today = new Date()
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

      expect(isToday(today)).toBe(true)
      expect(isToday(yesterday)).toBe(false)
      expect(isToday(tomorrow)).toBe(false)
    })
  })

  describe('Object utilities', () => {
    const pick = <T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
      const result = {} as Pick<T, K>
      for (const key of keys) {
        if (key in obj) {
          result[key] = obj[key]
        }
      }
      return result
    }

    it('should pick specified keys from object', () => {
      const obj = { name: 'John', age: 30, city: 'NYC', country: 'USA' }
      const picked = pick(obj, ['name', 'age'])
      
      expect(picked).toEqual({ name: 'John', age: 30 })
      expect(picked).not.toHaveProperty('city')
      expect(picked).not.toHaveProperty('country')
    })

    it('should handle missing keys', () => {
      const obj = { name: 'John' }
      const picked = pick(obj, ['name', 'age'] as any)
      
      expect(picked).toEqual({ name: 'John' })
    })
  })

  describe('Validation utilities', () => {
    const isValidEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    it('should validate email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
      expect(isValidEmail('invalid.email')).toBe(false)
      expect(isValidEmail('invalid@')).toBe(false)
      expect(isValidEmail('@domain.com')).toBe(false)
      expect(isValidEmail('')).toBe(false)
    })

    const isValidPhone = (phone: string): boolean => {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
      return phoneRegex.test(phone)
    }

    it('should validate phone numbers', () => {
      expect(isValidPhone('+1234567890')).toBe(true)
      expect(isValidPhone('(123) 456-7890')).toBe(true)
      expect(isValidPhone('123-456-7890')).toBe(true)
      expect(isValidPhone('123456789')).toBe(false) // too short
      expect(isValidPhone('abc')).toBe(false)
    })
  })
})