// Business logic tests for donor calculations

describe('Donor Calculations', () => {
  // Business logic for calculating donor statistics
  const calculateDonationStats = (donations: Array<{ amount: number; date: Date }>) => {
    if (donations.length === 0) {
      return {
        total: 0,
        average: 0,
        count: 0,
        largestDonation: 0,
        smallestDonation: 0,
        mostRecentDate: null,
        oldestDate: null,
      }
    }

    const amounts = donations.map(d => d.amount)
    const dates = donations.map(d => d.date)
    
    return {
      total: amounts.reduce((sum, amount) => sum + amount, 0),
      average: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
      count: donations.length,
      largestDonation: Math.max(...amounts),
      smallestDonation: Math.min(...amounts),
      mostRecentDate: new Date(Math.max(...dates.map(d => d.getTime()))),
      oldestDate: new Date(Math.min(...dates.map(d => d.getTime()))),
    }
  }

  // Business logic for determining donor tier
  const getDonorTier = (totalDonations: number) => {
    if (totalDonations >= 100000) return 'platinum'      // $1000+
    if (totalDonations >= 50000) return 'gold'           // $500+
    if (totalDonations >= 25000) return 'silver'         // $250+
    if (totalDonations >= 10000) return 'bronze'         // $100+
    return 'supporter'
  }

  // Business logic for calculating giving frequency
  const calculateGivingFrequency = (donations: Array<{ date: Date }>) => {
    if (donations.length <= 1) return 'one-time'
    
    const sortedDates = donations.map(d => d.date).sort((a, b) => a.getTime() - b.getTime())
    const daysBetween = []
    
    for (let i = 1; i < sortedDates.length; i++) {
      const days = (sortedDates[i].getTime() - sortedDates[i-1].getTime()) / (1000 * 60 * 60 * 24)
      daysBetween.push(days)
    }
    
    const averageDaysBetween = daysBetween.reduce((sum, days) => sum + days, 0) / daysBetween.length
    
    if (averageDaysBetween <= 35) return 'monthly'
    if (averageDaysBetween <= 100) return 'quarterly'
    if (averageDaysBetween <= 200) return 'semi-annual'
    if (averageDaysBetween <= 400) return 'annual'
    return 'irregular'
  }

  describe('calculateDonationStats', () => {
    it('should calculate correct statistics for multiple donations', () => {
      const donations = [
        { amount: 10000, date: new Date('2023-01-01') }, // $100
        { amount: 25000, date: new Date('2023-06-01') }, // $250
        { amount: 15000, date: new Date('2023-12-01') }, // $150
      ]

      const stats = calculateDonationStats(donations)

      expect(stats.total).toBe(50000) // $500 total
      expect(stats.average).toBe(16666.666666666668) // ~$166.67 average
      expect(stats.count).toBe(3)
      expect(stats.largestDonation).toBe(25000) // $250
      expect(stats.smallestDonation).toBe(10000) // $100
      expect(stats.mostRecentDate).toEqual(new Date('2023-12-01'))
      expect(stats.oldestDate).toEqual(new Date('2023-01-01'))
    })

    it('should handle empty donations array', () => {
      const stats = calculateDonationStats([])

      expect(stats.total).toBe(0)
      expect(stats.average).toBe(0)
      expect(stats.count).toBe(0)
      expect(stats.largestDonation).toBe(0)
      expect(stats.smallestDonation).toBe(0)
      expect(stats.mostRecentDate).toBeNull()
      expect(stats.oldestDate).toBeNull()
    })

    it('should handle single donation', () => {
      const donations = [{ amount: 15000, date: new Date('2023-01-01') }]
      const stats = calculateDonationStats(donations)

      expect(stats.total).toBe(15000)
      expect(stats.average).toBe(15000)
      expect(stats.count).toBe(1)
      expect(stats.largestDonation).toBe(15000)
      expect(stats.smallestDonation).toBe(15000)
    })
  })

  describe('getDonorTier', () => {
    it('should correctly classify donor tiers', () => {
      expect(getDonorTier(150000)).toBe('platinum') // $1500
      expect(getDonorTier(75000)).toBe('gold')      // $750
      expect(getDonorTier(30000)).toBe('silver')    // $300
      expect(getDonorTier(15000)).toBe('bronze')    // $150
      expect(getDonorTier(5000)).toBe('supporter')  // $50
      expect(getDonorTier(0)).toBe('supporter')     // $0
    })

    it('should handle edge cases at tier boundaries', () => {
      expect(getDonorTier(100000)).toBe('platinum') // Exactly $1000
      expect(getDonorTier(99999)).toBe('gold')       // Just under $1000
      expect(getDonorTier(50000)).toBe('gold')       // Exactly $500
      expect(getDonorTier(49999)).toBe('silver')     // Just under $500
    })
  })

  describe('calculateGivingFrequency', () => {
    it('should identify monthly giving pattern', () => {
      const donations = [
        { date: new Date('2023-01-01') },
        { date: new Date('2023-02-01') },
        { date: new Date('2023-03-01') },
        { date: new Date('2023-04-01') },
      ]

      expect(calculateGivingFrequency(donations)).toBe('monthly')
    })

    it('should identify quarterly giving pattern', () => {
      const donations = [
        { date: new Date('2023-01-01') },
        { date: new Date('2023-04-01') },
        { date: new Date('2023-07-01') },
        { date: new Date('2023-10-01') },
      ]

      expect(calculateGivingFrequency(donations)).toBe('quarterly')
    })

    it('should identify annual giving pattern', () => {
      const donations = [
        { date: new Date('2022-01-01') },
        { date: new Date('2023-01-01') },
        { date: new Date('2024-01-01') },
      ]

      expect(calculateGivingFrequency(donations)).toBe('annual')
    })

    it('should handle one-time donations', () => {
      const donations = [{ date: new Date('2023-01-01') }]
      expect(calculateGivingFrequency(donations)).toBe('one-time')
      
      const emptyDonations: Array<{ date: Date }> = []
      expect(calculateGivingFrequency(emptyDonations)).toBe('one-time')
    })

    it('should identify irregular giving pattern', () => {
      const donations = [
        { date: new Date('2020-01-01') },
        { date: new Date('2021-06-01') },
        { date: new Date('2023-12-01') },
      ]

      expect(calculateGivingFrequency(donations)).toBe('irregular')
    })
  })

  describe('integrated donor analysis', () => {
    it('should provide comprehensive donor analysis', () => {
      const donations = [
        { amount: 25000, date: new Date('2023-01-15') }, // $250
        { amount: 25000, date: new Date('2023-04-15') }, // $250
        { amount: 30000, date: new Date('2023-07-15') }, // $300
        { amount: 20000, date: new Date('2023-10-15') }, // $200
      ]

      const stats = calculateDonationStats(donations)
      const tier = getDonorTier(stats.total)
      const frequency = calculateGivingFrequency(donations)

      // Comprehensive analysis
      expect(stats.total).toBe(100000) // $1000 total
      expect(tier).toBe('platinum')    // Top tier donor
      expect(frequency).toBe('quarterly') // Regular quarterly giver

      // This would be a high-value, consistent donor
      const isHighValueDonor = tier === 'platinum' && frequency !== 'one-time'
      expect(isHighValueDonor).toBe(true)
    })

    it('should identify potential major gift prospects', () => {
      // Donor with increasing gift sizes - potential for major gift
      const donations = [
        { amount: 10000, date: new Date('2022-01-01') }, // $100
        { amount: 15000, date: new Date('2023-01-01') }, // $150
        { amount: 25000, date: new Date('2024-01-01') }, // $250
      ]

      const stats = calculateDonationStats(donations)
      const tier = getDonorTier(stats.total)
      
      // Check for upward giving trend
      const sortedAmounts = donations.sort((a, b) => a.date.getTime() - b.date.getTime()).map(d => d.amount)
      const isIncreasingTrend = sortedAmounts.every((amount, i) => i === 0 || amount >= sortedAmounts[i - 1])
      
      expect(isIncreasingTrend).toBe(true)
      expect(stats.largestDonation).toBe(25000) // Most recent is largest
      expect(tier).toBe('gold') // Good tier with growth potential (total: $500)
      
      // This donor shows major gift potential
      const hasMajorGiftPotential = isIncreasingTrend && stats.largestDonation >= 20000
      expect(hasMajorGiftPotential).toBe(true)
    })
  })
})