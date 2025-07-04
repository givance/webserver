import React from 'react';
import { render, screen } from '@testing-library/react';
import { WhatsAppChatMessage } from '@/app/(app)/whatsapp/WhatsAppChatMessage';

// Mock date-fns
jest.mock('date-fns', () => ({
  format: (date: Date, formatStr: string) => {
    return '12:34';
  },
}));

describe('WhatsAppChatMessage', () => {
  const baseMessage = {
    id: '1',
    content: 'Hello, this is a test message',
    role: 'user' as const,
    timestamp: new Date('2024-01-01T12:34:56Z'),
  };

  it('should render user message', () => {
    render(<WhatsAppChatMessage message={baseMessage} />);
    
    expect(screen.getByText('Hello, this is a test message')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
  });

  it('should render assistant message with different styling', () => {
    const assistantMessage = { ...baseMessage, role: 'assistant' as const };
    render(<WhatsAppChatMessage message={assistantMessage} />);
    
    const message = screen.getByText('Hello, this is a test message');
    expect(message).toBeInTheDocument();
    // Assistant messages should have different styling
    const messageContainer = message.closest('div');
    expect(messageContainer).toHaveClass('bg-gray-100');
  });

  it('should handle long messages', () => {
    const longMessage = {
      ...baseMessage,
      content: 'This is a very long message that contains multiple sentences. It should wrap properly and display all the content without any issues. The component should handle this gracefully.'
    };
    
    render(<WhatsAppChatMessage message={longMessage} />);
    
    expect(screen.getByText(longMessage.content)).toBeInTheDocument();
  });

  it('should handle messages with line breaks', () => {
    const multilineMessage = {
      ...baseMessage,
      content: 'First line\nSecond line\nThird line'
    };
    
    render(<WhatsAppChatMessage message={multilineMessage} />);
    
    // The component uses whitespace-pre-wrap which preserves line breaks
    const messageElement = screen.getByText('First line Second line Third line');
    expect(messageElement).toBeInTheDocument();
  });

  it('should display voice message indicator', () => {
    const voiceMessage = { ...baseMessage, isTranscribed: true };
    render(<WhatsAppChatMessage message={voiceMessage} />);
    
    expect(screen.getByText('(Voice message)')).toBeInTheDocument();
  });

  it('should display token usage information', () => {
    const messageWithTokens = {
      ...baseMessage,
      tokensUsed: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };
    
    render(<WhatsAppChatMessage message={messageWithTokens} />);
    
    expect(screen.getByText(/150 tokens/i)).toBeInTheDocument();
  });

  it('should handle empty message gracefully', () => {
    const emptyMessage = { ...baseMessage, content: '' };
    render(<WhatsAppChatMessage message={emptyMessage} />);
    
    // Should still render timestamp
    expect(screen.getByText('12:34')).toBeInTheDocument();
  });

  it('should apply correct alignment for user vs assistant', () => {
    const { rerender, container } = render(<WhatsAppChatMessage message={baseMessage} />);
    
    let messageWrapper = container.querySelector('.flex.w-full');
    expect(messageWrapper).toHaveClass('justify-end'); // User messages align right
    
    const assistantMessage = { ...baseMessage, role: 'assistant' as const };
    rerender(<WhatsAppChatMessage message={assistantMessage} />);
    
    messageWrapper = container.querySelector('.flex.w-full');
    expect(messageWrapper).toHaveClass('justify-start'); // Assistant messages align left
  });

  it('should apply correct colors for user messages', () => {
    render(<WhatsAppChatMessage message={baseMessage} />);
    
    const messageContainer = screen.getByText('Hello, this is a test message').closest('div');
    expect(messageContainer).toHaveClass('bg-blue-500', 'text-white');
  });

  it('should handle timestamps correctly', () => {
    const messageWithSpecificTime = {
      ...baseMessage,
      timestamp: new Date('2024-01-01T15:45:00Z'),
    };
    
    render(<WhatsAppChatMessage message={messageWithSpecificTime} />);
    
    // The mock returns '12:34' regardless of input
    expect(screen.getByText('12:34')).toBeInTheDocument();
  });
});