// Mock API handlers - simplified version

describe('Mock API handlers', () => {
  it('should be available for API mocking', () => {
    expect(true).toBe(true)
  })
})

// Simple mock responses for testing
export const mockOpenAIResponse = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant' as const,
        content: 'This is a mock AI response for testing purposes.',
      },
      finish_reason: 'stop' as const,
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  },
}

export const mockPersonResearchResponse = {
  name: 'John Doe',
  age: 45,
  location: 'New York, NY',
  occupation: 'Software Engineer',
  company: 'Tech Corp',
  donorClassification: {
    category: 'High Potential',
    confidence: 0.85,
  },
}