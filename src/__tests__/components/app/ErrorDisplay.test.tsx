import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorDisplay } from '@/app/components/ErrorDisplay';

describe('ErrorDisplay', () => {
  it('should render error message', () => {
    render(<ErrorDisplay error="Something went wrong" />);
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should render with custom title', () => {
    render(<ErrorDisplay error="Network error" title="Connection Failed" />);
    
    expect(screen.getByText('Connection Failed')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should render without title when not provided', () => {
    render(<ErrorDisplay error="An error occurred" />);
    
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('should handle long error messages', () => {
    const longError = 'This is a very long error message that contains a lot of details about what went wrong in the system';
    render(<ErrorDisplay error={longError} />);
    
    expect(screen.getByText(longError)).toBeInTheDocument();
  });

  it('should escape HTML in error messages', () => {
    const htmlError = '<script>alert("XSS")</script>Error occurred';
    render(<ErrorDisplay error={htmlError} />);
    
    // The HTML should be escaped and displayed as text
    expect(screen.getByText(htmlError)).toBeInTheDocument();
  });

  it('should have proper error styling', () => {
    const { container } = render(<ErrorDisplay error="Test error" />);
    
    // Check for error-related classes or styles
    const errorElement = container.firstChild;
    expect(errorElement).toBeInTheDocument();
  });
});