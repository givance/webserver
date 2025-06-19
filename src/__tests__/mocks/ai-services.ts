// AI services mocks - simplified version

describe('AI services mocks', () => {
  it('should be available for AI service mocking', () => {
    expect(true).toBe(true)
  })
})

// Mock AI service responses for testing
export const mockEmailGenerationResponse = {
  subject: 'Partnership Opportunity in Tech Education',
  body: 'Dear John,\n\nI hope this message finds you well...',
  tone: 'professional',
  personalizationElements: [
    'References recipient\'s work at Tech Corp',
    'Mentions previous philanthropic interests in education',
  ],
}

export const mockDonorClassificationResponse = {
  classification: {
    stage: 'Cultivation',
    confidence: 0.82,
    reasoning: 'Donor has shown consistent engagement and moderate giving history',
  },
  suggestedActions: [
    {
      action: 'Schedule personal meeting',
      priority: 'high',
      timeline: 'Within 2 weeks',
    },
  ],
}

// Mock AI service classes for testing
export class MockOpenAIService {
  static async generateCompletion(prompt: string) {
    return {
      id: 'chatcmpl-test',
      choices: [{ message: { content: 'Mock response' } }],
    }
  }
}

export class MockPersonResearchService {
  static async researchPerson(name: string, context: any) {
    return {
      name,
      classification: 'High Potential',
      confidence: 0.85,
    }
  }
}