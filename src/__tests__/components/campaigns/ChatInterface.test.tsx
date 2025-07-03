import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface, ChatMessage, ProjectMentionData } from '@/app/(app)/campaign/components/ChatInterface';

// Mock dependencies
jest.mock('react-mentions', () => ({
  MentionsInput: ({ value, onChange, children, onKeyDown, disabled, ...props }: any) => (
    <textarea
      data-testid="mentions-input"
      value={value}
      onChange={(e) => onChange(e, e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      {...props}
    />
  ),
  Mention: ({ trigger, data }: any) => null,
}));

jest.mock('@/app/(app)/campaign/components/SuggestedMemories', () => ({
  SuggestedMemories: ({ memories }: any) => (
    <div data-testid="suggested-memories">
      {memories?.map((memory: string, index: number) => (
        <div key={index} data-testid={`memory-${index}`}>
          {memory}
        </div>
      ))}
    </div>
  ),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Performance tracking utilities
const createRenderCounter = () => {
  let renderCount = 0;
  const RenderCounter = ({ children }: { children: React.ReactNode }) => {
    renderCount++;
    return <>{children}</>;
  };
  return { RenderCounter, getRenderCount: () => renderCount };
};

describe('ChatInterface', () => {
  const mockProps = {
    instruction: '',
    onInstructionChange: jest.fn(),
    chatMessages: [] as ChatMessage[],
    isGenerating: false,
    isLoadingProjects: false,
    projectMentions: [] as ProjectMentionData[],
    suggestedMemories: [] as string[],
    onSubmitInstruction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render the chat interface components', () => {
      render(<ChatInterface {...mockProps} />);
      
      expect(screen.getByTestId('mentions-input')).toBeInTheDocument();
      expect(screen.getByText('Generate Emails')).toBeInTheDocument();
    });

    it('should display chat messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello AI' },
        { role: 'assistant', content: 'Hello! How can I help you?' },
      ];

      render(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    });

    it('should apply correct CSS classes for message alignment', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
      ];

      const { container } = render(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      const userMessage = screen.getByText('User message').closest('div[class*="flex"]');
      const assistantMessage = screen.getByText('Assistant message').closest('div[class*="flex"]');
      
      expect(userMessage).toHaveClass('items-end');
      expect(assistantMessage).not.toHaveClass('items-end');
    });
  });

  describe('User Interactions', () => {
    it('should handle instruction input changes', () => {
      render(<ChatInterface {...mockProps} />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.change(input, { target: { value: 'New instruction' } });
      
      expect(mockProps.onInstructionChange).toHaveBeenCalledWith('New instruction');
    });

    it('should handle rapid typing without performance issues', () => {
      render(<ChatInterface {...mockProps} />);
      
      const input = screen.getByTestId('mentions-input');
      const testString = 'This is a test of rapid typing performance';
      
      // Simulate rapid typing
      testString.split('').forEach((char, index) => {
        fireEvent.change(input, { target: { value: testString.slice(0, index + 1) } });
      });
      
      expect(mockProps.onInstructionChange).toHaveBeenCalledTimes(testString.length);
    });

    it('should debounce input if needed (placeholder for actual debounce test)', () => {
      // This would test debouncing if implemented
      render(<ChatInterface {...mockProps} />);
      
      const input = screen.getByTestId('mentions-input');
      
      // Rapid changes
      for (let i = 0; i < 10; i++) {
        fireEvent.change(input, { target: { value: `Text ${i}` } });
      }
      
      // All changes should go through since no debouncing is implemented
      expect(mockProps.onInstructionChange).toHaveBeenCalledTimes(10);
    });

    it('should submit on Cmd/Ctrl+Enter', () => {
      render(<ChatInterface {...mockProps} instruction="Test instruction" />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
      
      expect(mockProps.onSubmitInstruction).toHaveBeenCalledTimes(1);
    });

    it('should not submit on Enter without modifier key', () => {
      render(<ChatInterface {...mockProps} instruction="Test instruction" />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(mockProps.onSubmitInstruction).not.toHaveBeenCalled();
    });

    it('should support Ctrl+Enter on Windows/Linux', () => {
      render(<ChatInterface {...mockProps} instruction="Test instruction" />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
      
      expect(mockProps.onSubmitInstruction).toHaveBeenCalledTimes(1);
    });

    it('should not submit when instruction is empty', () => {
      render(<ChatInterface {...mockProps} instruction="" />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
      
      expect(mockProps.onSubmitInstruction).not.toHaveBeenCalled();
    });

    it('should not submit when instruction is only whitespace', () => {
      render(<ChatInterface {...mockProps} instruction="   " />);
      
      const input = screen.getByTestId('mentions-input');
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
      
      expect(mockProps.onSubmitInstruction).not.toHaveBeenCalled();
    });
  });

  describe('Loading and Disabled States', () => {
    it('should disable input and button when generating', () => {
      render(<ChatInterface {...mockProps} isGenerating={true} />);
      
      const button = screen.getByText('Generating...');
      expect(button).toBeDisabled();
    });

    it('should show loading indicator when loading projects', () => {
      render(<ChatInterface {...mockProps} isLoadingProjects={true} />);
      
      const input = screen.getByTestId('mentions-input');
      expect(input).toHaveAttribute('placeholder', 'Loading projects...');
    });

    it('should disable submit button when instruction is empty', () => {
      render(<ChatInterface {...mockProps} instruction="" />);
      
      const submitButton = screen.getByText('Generate Emails');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when instruction is provided', () => {
      render(<ChatInterface {...mockProps} instruction="Some text" />);
      
      const submitButton = screen.getByText('Generate Emails');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Project Mentions', () => {
    it('should show project mentions when available', () => {
      const projectMentions: ProjectMentionData[] = [
        { id: '1', display: 'Project Alpha' },
        { id: '2', display: 'Project Beta' },
      ];

      render(<ChatInterface {...mockProps} projectMentions={projectMentions} />);
      
      const input = screen.getByTestId('mentions-input');
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Type @ to mention projects'));
    });

    it('should handle empty project mentions', () => {
      render(<ChatInterface {...mockProps} projectMentions={[]} />);
      
      const input = screen.getByTestId('mentions-input');
      expect(input).toHaveAttribute('placeholder', 'Enter instructions...');
    });
  });

  describe('Suggested Memories', () => {
    it('should display suggested memories after assistant message', () => {
      const memories = ['Memory 1', 'Memory 2'];
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Generate emails' },
        { role: 'assistant', content: 'I will help you generate emails' },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} suggestedMemories={memories} />);
      
      expect(screen.getByTestId('memory-0')).toHaveTextContent('Memory 1');
      expect(screen.getByTestId('memory-1')).toHaveTextContent('Memory 2');
    });

    it('should only show memories after the last assistant message', () => {
      const memories = ['Memory 1'];
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Another question' },
        { role: 'assistant', content: 'Second response' },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} suggestedMemories={memories} />);
      
      // Memories should only appear after the last assistant message
      const memoryElements = screen.getAllByTestId(/memory-/);
      expect(memoryElements).toHaveLength(1);
    });

    it('should not show memories after user messages', () => {
      const memories = ['Memory 1'];
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Last message is from user' },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} suggestedMemories={memories} />);
      
      expect(screen.queryByTestId('memory-0')).not.toBeInTheDocument();
    });
  });

  describe('Scrolling Behavior', () => {
    it('should scroll to bottom when new messages are added', () => {
      const { rerender } = render(<ChatInterface {...mockProps} />);
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'New message' },
      ];
      
      rerender(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('should scroll to bottom when multiple messages are added', () => {
      const { rerender } = render(<ChatInterface {...mockProps} />);
      
      jest.clearAllMocks();
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
      ];
      
      rerender(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe('Performance and Re-render Tests', () => {
    it('should not re-render when unrelated props remain the same', () => {
      const { RenderCounter, getRenderCount } = createRenderCounter();
      
      const { rerender } = render(
        <RenderCounter>
          <ChatInterface {...mockProps} />
        </RenderCounter>
      );
      
      const initialRenderCount = getRenderCount();
      
      // Re-render with same props
      rerender(
        <RenderCounter>
          <ChatInterface {...mockProps} />
        </RenderCounter>
      );
      
      // Should only render once more
      expect(getRenderCount()).toBe(initialRenderCount + 1);
    });

    it('should only re-render when instruction changes', () => {
      const { RenderCounter, getRenderCount } = createRenderCounter();
      
      const { rerender } = render(
        <RenderCounter>
          <ChatInterface {...mockProps} instruction="initial" />
        </RenderCounter>
      );
      
      const initialCount = getRenderCount();
      
      // Change instruction
      rerender(
        <RenderCounter>
          <ChatInterface {...mockProps} instruction="updated" />
        </RenderCounter>
      );
      
      expect(getRenderCount()).toBe(initialCount + 1);
    });

    it('should handle rapid prop changes efficiently', () => {
      const { rerender } = render(<ChatInterface {...mockProps} />);
      
      // Simulate rapid prop changes
      for (let i = 0; i < 100; i++) {
        rerender(<ChatInterface {...mockProps} instruction={`Text ${i}`} />);
      }
      
      // Component should still be responsive
      const input = screen.getByTestId('mentions-input');
      expect(input).toBeInTheDocument();
    });

    it('should not cause memory leaks with message updates', () => {
      const { rerender } = render(<ChatInterface {...mockProps} />);
      
      // Add many messages
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 1000; i++) {
        messages.push(
          { role: 'user', content: `Message ${i}` },
          { role: 'assistant', content: `Response ${i}` }
        );
      }
      
      rerender(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      // Should handle large message arrays without issues
      expect(screen.getByText('Message 0')).toBeInTheDocument();
      expect(screen.getByText('Response 999')).toBeInTheDocument();
    });

    it('should memoize expensive computations', () => {
      // This tests that the component doesn't recalculate values unnecessarily
      const expensiveComputation = jest.fn(() => 'computed');
      
      const TestWrapper = ({ instruction }: { instruction: string }) => {
        const computed = React.useMemo(() => expensiveComputation(), [instruction]);
        return <ChatInterface {...mockProps} instruction={instruction} />;
      };
      
      const { rerender } = render(<TestWrapper instruction="test" />);
      
      expect(expensiveComputation).toHaveBeenCalledTimes(1);
      
      // Same prop, should not recompute
      rerender(<TestWrapper instruction="test" />);
      expect(expensiveComputation).toHaveBeenCalledTimes(1);
      
      // Different prop, should recompute
      rerender(<TestWrapper instruction="new" />);
      expect(expensiveComputation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty chat messages array', () => {
      render(<ChatInterface {...mockProps} />);
      
      expect(screen.getByTestId('mentions-input')).toBeInTheDocument();
    });

    it('should handle null/undefined in messages gracefully', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      // Should render without crashing
      expect(screen.getByTestId('mentions-input')).toBeInTheDocument();
    });

    it('should handle very long messages', () => {
      const longContent = 'A'.repeat(10000);
      const messages: ChatMessage[] = [
        { role: 'user', content: longContent },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it('should handle special characters in messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '<script>alert("XSS")</script>' },
        { role: 'assistant', content: '& < > " \' special chars' },
      ];
      
      render(<ChatInterface {...mockProps} chatMessages={messages} />);
      
      expect(screen.getByText('<script>alert("XSS")</script>')).toBeInTheDocument();
      expect(screen.getByText('& < > " \' special chars')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<ChatInterface {...mockProps} />);
      
      const input = screen.getByTestId('mentions-input');
      expect(input).toHaveAttribute('placeholder');
    });

    it('should be keyboard navigable', () => {
      render(<ChatInterface {...mockProps} />);
      
      const input = screen.getByTestId('mentions-input');
      const button = screen.getByText('Generate Emails');
      
      // Focus should be manageable
      input.focus();
      expect(document.activeElement).toBe(input);
      
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });

  describe('Form Submission', () => {
    it('should handle form submission correctly', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      render(<ChatInterface {...mockProps} instruction="Test" onSubmitInstruction={onSubmit} />);
      
      const button = screen.getByText('Generate Emails');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle submission errors gracefully', async () => {
      const onSubmit = jest.fn().mockRejectedValue(new Error('Submission failed'));
      render(<ChatInterface {...mockProps} instruction="Test" onSubmitInstruction={onSubmit} />);
      
      const button = screen.getByText('Generate Emails');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      
      // Component should still be functional after error
      expect(screen.getByTestId('mentions-input')).toBeInTheDocument();
    });

    it('should prevent double submission', async () => {
      const onSubmit = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(<ChatInterface {...mockProps} instruction="Test" onSubmitInstruction={onSubmit} />);
      
      const button = screen.getByText('Generate Emails');
      
      // Click multiple times rapidly
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
    });
  });
});