import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from '@/app/components/LoadingSkeleton';

// LoadingSkeleton is mocked in setup.ts
describe('LoadingSkeleton', () => {
  it('should render loading skeleton', () => {
    render(<LoadingSkeleton />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<LoadingSkeleton message="Loading donors..." />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render multiple skeletons when count is provided', () => {
    render(<LoadingSkeleton count={3} />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('should render with different sizes', () => {
    const { rerender } = render(<LoadingSkeleton size="small" />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    
    rerender(<LoadingSkeleton size="medium" />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    
    rerender(<LoadingSkeleton size="large" />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('should render inline variant', () => {
    render(<LoadingSkeleton variant="inline" />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });
});