import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageSizeSelector } from '@/app/components/PageSizeSelector';
import { PAGE_SIZE_OPTIONS } from '@/app/hooks/use-pagination';

describe('PageSizeSelector', () => {
  const mockOnPageSizeChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default page size', () => {
    render(
      <PageSizeSelector 
        pageSize={25} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    // PageSizeSelector is mocked in setup.ts to render a select element
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('25');
  });

  it('should display all page size options', () => {
    render(
      <PageSizeSelector 
        pageSize={25} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    // Check that all options are present
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3); // Based on the mock in setup.ts
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('should call onPageSizeChange when selection changes', () => {
    render(
      <PageSizeSelector 
        pageSize={25} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '50' } });
    
    expect(mockOnPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('should handle different initial page sizes', () => {
    const { rerender } = render(
      <PageSizeSelector 
        pageSize={10} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    expect(screen.getByRole('combobox')).toHaveValue('10');
    
    rerender(
      <PageSizeSelector 
        pageSize={50} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    expect(screen.getByRole('combobox')).toHaveValue('50');
  });

  it('should convert string value to number', () => {
    render(
      <PageSizeSelector 
        pageSize={25} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '10' } });
    
    // Should receive number, not string
    expect(mockOnPageSizeChange).toHaveBeenCalledWith(10);
    expect(mockOnPageSizeChange).not.toHaveBeenCalledWith('10');
  });

  it('should update when pageSize prop changes', () => {
    const { rerender } = render(
      <PageSizeSelector 
        pageSize={25} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('25');
    
    rerender(
      <PageSizeSelector 
        pageSize={10} 
        onPageSizeChange={mockOnPageSizeChange} 
      />
    );
    
    expect(select).toHaveValue('10');
  });
});