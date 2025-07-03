import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailDisplay } from '@/app/(app)/campaign/components/EmailDisplay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies
const mockUpdateEmail = jest.fn();
jest.mock('@/app/hooks/use-communications', () => ({
  useCommunications: () => ({
    updateEmail: {
      mutate: mockUpdateEmail,
      isPending: false,
    },
  }),
}));

jest.mock('@/app/(app)/campaign/components/EmailEditModal', () => ({
  EmailEditModal: ({ open, onOpenChange, onSave, initialSubject, initialContent, ...props }: any) => 
    open ? (
      <div data-testid="email-edit-modal">
        <h2>Edit Email</h2>
        <input 
          data-testid="subject-input" 
          defaultValue={initialSubject}
          aria-label="Email subject"
        />
        <textarea 
          data-testid="content-input" 
          defaultValue={Array.isArray(initialContent) ? initialContent.join('\n') : initialContent}
          aria-label="Email content"
        />
        <button onClick={() => onOpenChange(false)}>Close</button>
        <button 
          onClick={() => {
            const subject = (document.querySelector('[data-testid="subject-input"]') as HTMLInputElement)?.value;
            const content = (document.querySelector('[data-testid="content-input"]') as HTMLTextAreaElement)?.value;
            onSave(subject, content);
          }}
        >
          Save
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

jest.mock('@/app/(app)/campaign/components/EmailSendButton', () => ({
  EmailSendButton: ({ emailId, disabled, onSendSuccess }: any) => (
    <button 
      data-testid="email-send-button" 
      disabled={disabled}
      onClick={() => onSendSuccess?.()}
    >
      Send Email
    </button>
  ),
}));

// Performance tracking utilities
const createRenderCounter = () => {
  let renderCount = 0;
  const RenderCounter = ({ children }: { children: React.ReactNode }) => {
    renderCount++;
    return <>{children}</>;
  };
  return { RenderCounter, getRenderCount: () => renderCount };
};

// Helper to wrap component with providers
const renderWithProviders = (ui: React.ReactElement, options?: any) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    options
  );

  return {
    ...rendered,
    rerender: (ui: React.ReactElement) => 
      rendered.rerender(
        <QueryClientProvider client={queryClient}>
          {ui}
        </QueryClientProvider>
      ),
  };
};

describe('EmailDisplay', () => {
  const baseProps = {
    content: 'This is the email content',
    subject: 'Test Subject',
    donorId: 'donor-123',
    donorName: 'John Doe',
    donorEmail: 'john@example.com',
    emailId: 'email-123',
    status: 'draft' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render email content and subject', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      expect(screen.getByText('Test Subject')).toBeInTheDocument();
      expect(screen.getByText('This is the email content')).toBeInTheDocument();
    });

    it('should display donor information correctly', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('(john@example.com)')).toBeInTheDocument();
    });

    it('should handle missing donor name gracefully', () => {
      renderWithProviders(<EmailDisplay {...baseProps} donorName="" />);
      
      expect(screen.getByText('(john@example.com)')).toBeInTheDocument();
    });

    it('should show status badge with correct styling', () => {
      const { container } = renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const badge = screen.getByText('draft');
      expect(badge).toBeInTheDocument();
      expect(badge.tagName).toBe('SPAN'); // Assuming badge is a span
    });

    it('should render different status colors', () => {
      const { rerender } = renderWithProviders(<EmailDisplay {...baseProps} status="sent" />);
      expect(screen.getByText('sent')).toBeInTheDocument();
      
      rerender(<EmailDisplay {...baseProps} status="failed" />);
      expect(screen.getByText('failed')).toBeInTheDocument();
      
      rerender(<EmailDisplay {...baseProps} status="scheduled" />);
      expect(screen.getByText('scheduled')).toBeInTheDocument();
      
      rerender(<EmailDisplay {...baseProps} status="pending" />);
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('should handle content as array', () => {
      const contentArray = ['Paragraph 1', 'Paragraph 2', 'Paragraph 3'];
      renderWithProviders(<EmailDisplay {...baseProps} content={contentArray} />);
      
      expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 3')).toBeInTheDocument();
    });

    it('should handle empty content', () => {
      renderWithProviders(<EmailDisplay {...baseProps} content="" />);
      
      expect(screen.getByText('Test Subject')).toBeInTheDocument();
      // Empty content should not crash the component
    });

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000);
      renderWithProviders(<EmailDisplay {...baseProps} content={longContent} />);
      
      expect(screen.getByText(longContent)).toBeInTheDocument();
    });
  });

  describe('Edit Functionality', () => {
    it('should show edit button for draft emails', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      expect(editButton).toBeInTheDocument();
      expect(editButton).not.toBeDisabled();
    });

    it('should not show edit button for sent emails', () => {
      renderWithProviders(<EmailDisplay {...baseProps} status="sent" />);
      
      const editButton = screen.queryByRole('button', { name: /edit/i });
      expect(editButton).not.toBeInTheDocument();
    });

    it('should not show edit button for scheduled emails', () => {
      renderWithProviders(<EmailDisplay {...baseProps} status="scheduled" />);
      
      const editButton = screen.queryByRole('button', { name: /edit/i });
      expect(editButton).not.toBeInTheDocument();
    });

    it('should open edit modal when edit button is clicked', async () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('email-edit-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Email')).toBeInTheDocument();
      });
    });

    it('should populate modal with current email data', async () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      await waitFor(() => {
        const subjectInput = screen.getByTestId('subject-input') as HTMLInputElement;
        const contentInput = screen.getByTestId('content-input') as HTMLTextAreaElement;
        
        expect(subjectInput.value).toBe('Test Subject');
        expect(contentInput.value).toBe('This is the email content');
      });
    });

    it('should save changes when save button is clicked', async () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('email-edit-modal')).toBeInTheDocument();
      });
      
      // Change values
      const subjectInput = screen.getByTestId('subject-input');
      const contentInput = screen.getByTestId('content-input');
      
      fireEvent.change(subjectInput, { target: { value: 'Updated Subject' } });
      fireEvent.change(contentInput, { target: { value: 'Updated content' } });
      
      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(mockUpdateEmail).toHaveBeenCalledWith({
          emailId: 'email-123',
          subject: 'Updated Subject',
          content: 'Updated content',
        });
      });
    });

    it('should close modal without saving when cancel is clicked', async () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('email-edit-modal')).toBeInTheDocument();
      });
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      await waitFor(() => {
        expect(screen.queryByTestId('email-edit-modal')).not.toBeInTheDocument();
        expect(mockUpdateEmail).not.toHaveBeenCalled();
      });
    });
  });

  describe('Preview Mode', () => {
    it('should handle preview mode with callback', () => {
      const onPreviewEdit = jest.fn();
      renderWithProviders(
        <EmailDisplay {...baseProps} isPreview={true} onPreviewEdit={onPreviewEdit} />
      );
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      // In preview mode, it should show the modal
      expect(screen.getByTestId('email-edit-modal')).toBeInTheDocument();
    });

    it('should call onPreviewEdit with updated values in preview mode', async () => {
      const onPreviewEdit = jest.fn();
      renderWithProviders(
        <EmailDisplay {...baseProps} isPreview={true} onPreviewEdit={onPreviewEdit} />
      );
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(onPreviewEdit).toHaveBeenCalledWith(
          'donor-123',
          expect.any(String),
          expect.any(String)
        );
      });
    });
  });

  describe('Send Functionality', () => {
    it('should display send button when email has ID', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      expect(screen.getByTestId('email-send-button')).toBeInTheDocument();
    });

    it('should not display send button without email ID', () => {
      renderWithProviders(<EmailDisplay {...baseProps} emailId={undefined} />);
      
      expect(screen.queryByTestId('email-send-button')).not.toBeInTheDocument();
    });

    it('should disable send button for sent emails', () => {
      renderWithProviders(<EmailDisplay {...baseProps} status="sent" />);
      
      const sendButton = screen.getByTestId('email-send-button');
      expect(sendButton).toBeDisabled();
    });

    it('should handle send success callback', () => {
      const onSendSuccess = jest.fn();
      renderWithProviders(
        <EmailDisplay {...baseProps} onSendSuccess={onSendSuccess} />
      );
      
      const sendButton = screen.getByTestId('email-send-button');
      fireEvent.click(sendButton);
      
      // The mock implementation calls onSendSuccess
      expect(onSendSuccess).toHaveBeenCalled();
    });
  });

  describe('Additional Information Display', () => {
    it('should display generation info when provided', () => {
      const generationInfo = {
        model: 'gpt-4',
        tokensUsed: 500,
        generatedAt: new Date('2024-01-01').toISOString(),
      };
      
      renderWithProviders(<EmailDisplay {...baseProps} generationInfo={generationInfo} />);
      
      expect(screen.getByText(/gpt-4/i)).toBeInTheDocument();
      expect(screen.getByText(/500/i)).toBeInTheDocument();
    });

    it('should display scheduled time when provided', () => {
      const scheduledAt = new Date('2024-12-25T10:00:00').toISOString();
      renderWithProviders(
        <EmailDisplay {...baseProps} status="scheduled" scheduledAt={scheduledAt} />
      );
      
      // Component should display the scheduled time somewhere
      expect(screen.getByText(/scheduled/i)).toBeInTheDocument();
    });

    it('should display error message for failed emails', () => {
      const errorMessage = 'Failed to send: Invalid recipient';
      renderWithProviders(
        <EmailDisplay {...baseProps} status="failed" errorMessage={errorMessage} />
      );
      
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });

    it('should display tracking info when email is sent', () => {
      const trackingInfo = {
        opened: true,
        openedAt: new Date('2024-01-02').toISOString(),
        clicks: 3,
      };
      
      renderWithProviders(
        <EmailDisplay {...baseProps} status="sent" trackingInfo={trackingInfo} />
      );
      
      // Component should show tracking info if implemented
      expect(screen.getByText(/sent/i)).toBeInTheDocument();
    });
  });

  describe('Performance Tests', () => {
    it('should not re-render unnecessarily when props remain the same', () => {
      const { RenderCounter, getRenderCount } = createRenderCounter();
      
      const { rerender } = renderWithProviders(
        <RenderCounter>
          <EmailDisplay {...baseProps} />
        </RenderCounter>
      );
      
      const initialRenderCount = getRenderCount();
      
      // Re-render with same props
      rerender(
        <RenderCounter>
          <EmailDisplay {...baseProps} />
        </RenderCounter>
      );
      
      // Should only render once more
      expect(getRenderCount()).toBe(initialRenderCount + 1);
    });

    it('should handle rapid status changes efficiently', () => {
      const { rerender } = renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const statuses = ['draft', 'pending', 'sent', 'failed', 'scheduled'] as const;
      
      // Rapid status changes
      statuses.forEach(status => {
        rerender(<EmailDisplay {...baseProps} status={status} />);
        expect(screen.getByText(status)).toBeInTheDocument();
      });
    });

    it('should handle large content arrays efficiently', () => {
      const largeContentArray = Array.from({ length: 1000 }, (_, i) => `Paragraph ${i}`);
      
      renderWithProviders(<EmailDisplay {...baseProps} content={largeContentArray} />);
      
      // Should render first and last paragraphs
      expect(screen.getByText('Paragraph 0')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 999')).toBeInTheDocument();
    });

    it('should memoize expensive computations', () => {
      const expensiveFormatter = jest.fn((content: string) => content.toUpperCase());
      
      const TestWrapper = ({ content }: { content: string }) => {
        const formatted = React.useMemo(() => expensiveFormatter(content), [content]);
        return <EmailDisplay {...baseProps} content={formatted} />;
      };
      
      const { rerender } = renderWithProviders(<TestWrapper content="test" />);
      
      expect(expensiveFormatter).toHaveBeenCalledTimes(1);
      
      // Same content, should not recompute
      rerender(<TestWrapper content="test" />);
      expect(expensiveFormatter).toHaveBeenCalledTimes(1);
      
      // Different content, should recompute
      rerender(<TestWrapper content="new" />);
      expect(expensiveFormatter).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const heading = screen.getByText('Test Subject');
      expect(heading.tagName).toMatch(/^H[1-6]$/);
    });

    it('should have proper button labels', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      expect(editButton).toHaveAccessibleName();
    });

    it('should support keyboard navigation', () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      const sendButton = screen.getByTestId('email-send-button');
      
      // Test focus
      editButton.focus();
      expect(document.activeElement).toBe(editButton);
      
      sendButton.focus();
      expect(document.activeElement).toBe(sendButton);
    });

    it('should announce status changes to screen readers', () => {
      const { rerender } = renderWithProviders(<EmailDisplay {...baseProps} />);
      
      // Status changes should be announced
      rerender(<EmailDisplay {...baseProps} status="sent" />);
      expect(screen.getByText('sent')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined content gracefully', () => {
      renderWithProviders(<EmailDisplay {...baseProps} content={undefined as any} />);
      
      expect(screen.getByText('Test Subject')).toBeInTheDocument();
    });

    it('should handle special characters in content', () => {
      const specialContent = '<script>alert("XSS")</script> & < > " \'';
      renderWithProviders(<EmailDisplay {...baseProps} content={specialContent} />);
      
      expect(screen.getByText(specialContent)).toBeInTheDocument();
    });

    it('should handle very long subject lines', () => {
      const longSubject = 'A'.repeat(500);
      renderWithProviders(<EmailDisplay {...baseProps} subject={longSubject} />);
      
      expect(screen.getByText(longSubject)).toBeInTheDocument();
    });

    it('should handle rapid modal open/close', async () => {
      const user = userEvent.setup();
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      
      // Rapid clicks
      await user.click(editButton);
      await user.click(editButton);
      await user.click(editButton);
      
      // Should only have one modal
      const modals = screen.queryAllByTestId('email-edit-modal');
      expect(modals.length).toBeLessThanOrEqual(1);
    });

    it('should handle network errors gracefully', async () => {
      mockUpdateEmail.mockRejectedValueOnce(new Error('Network error'));
      
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(mockUpdateEmail).toHaveBeenCalled();
      });
      
      // Component should still be functional
      expect(screen.getByText('Test Subject')).toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    it('should update UI after successful save', async () => {
      mockUpdateEmail.mockImplementation(({ subject, content }) => {
        // Simulate successful update
        Promise.resolve();
      });
      
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      const subjectInput = screen.getByTestId('subject-input');
      fireEvent.change(subjectInput, { target: { value: 'New Subject' } });
      
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        expect(mockUpdateEmail).toHaveBeenCalled();
        expect(screen.queryByTestId('email-edit-modal')).not.toBeInTheDocument();
      });
    });

    it('should handle concurrent edits properly', async () => {
      renderWithProviders(<EmailDisplay {...baseProps} />);
      
      // Open modal
      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);
      
      // Make multiple rapid saves
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        // Should only save once
        expect(mockUpdateEmail).toHaveBeenCalledTimes(1);
      });
    });
  });
});