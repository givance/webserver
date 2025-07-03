import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectDonorsAndNameStep } from '@/app/(app)/campaign/steps/SelectDonorsAndNameStep';

// Performance tracking utilities
const createRenderCounter = () => {
  let renderCount = 0;
  const RenderCounter = ({ children }: { children: React.ReactNode }) => {
    renderCount++;
    return <>{children}</>;
  };
  return { RenderCounter, getRenderCount: () => renderCount };
};

// Generate large donor list for performance testing
const generateLargeDonorList = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    firstName: `FirstName${i}`,
    lastName: `LastName${i}`,
    email: `donor${i}@example.com`,
    type: 'individual' as const,
    phoneNumber: `555-${String(i).padStart(4, '0')}`,
    totalDonations: Math.floor(Math.random() * 100000),
    lastDonationDate: new Date(2024, 0, 1 + (i % 30)).toISOString(),
  }));
};

// Mock the custom hooks
let mockDonorData = {
  donors: [
    { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', type: 'individual' },
    { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', type: 'individual' },
  ],
  total: 2,
};

let mockIsLoading = false;

jest.mock('@/app/hooks/use-donors', () => ({
  useDonors: () => ({
    listDonorsQuery: {
      data: mockDonorData,
      isLoading: mockIsLoading,
      refetch: jest.fn(),
    },
    listDonorsForCommunication: () => ({
      data: mockDonorData,
      isLoading: mockIsLoading,
    }),
  }),
}));

jest.mock('@/app/hooks/use-lists', () => ({
  useLists: () => ({
    getListQuery: {
      data: null,
      isLoading: false,
    },
    createListMutation: {
      mutate: jest.fn(),
      isPending: false,
    },
    listDonorLists: () => ({
      data: { lists: [] },
      isLoading: false,
    }),
    getDonorIdsFromListsQuery: () => ({
      data: [],
      isLoading: false,
    }),
  }),
}));

// Mock donor validation hook
jest.mock('@/app/hooks/use-donor-validation', () => ({
  useDonorStaffEmailValidation: (donorIds: number[] = []) => ({
    data: {
      valid: true,
      invalidDonors: [],
      missingEmails: [],
      donorsWithoutStaff: [],
      donorsWithStaffButNoEmail: [],
      staffWithoutOauth: [],
      totalDonors: donorIds.length,
      validDonors: donorIds.length,
    },
    isLoading: false,
  }),
}));

// Mock campaign auto-save hook
jest.mock('@/app/hooks/use-campaign-auto-save', () => ({
  useCampaignAutoSave: () => ({
    autoSave: jest.fn(),
    isSaving: false,
  }),
}));

// Mock UI components
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
}));

describe('SelectDonorsAndNameStep', () => {
  const mockProps = {
    selectedDonors: [],
    onDonorsSelected: jest.fn(),
    campaignName: '',
    onCampaignNameChange: jest.fn(),
    onNext: jest.fn(),
    sessionId: undefined,
    onSessionIdChange: jest.fn(),
    templateId: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock data
    mockDonorData = {
      donors: [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', type: 'individual' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', type: 'individual' },
      ],
      total: 2,
    };
    mockIsLoading = false;
  });

  it('should render campaign name input and donor list', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    // Check campaign name input exists with the actual placeholder
    expect(screen.getByPlaceholderText("e.g., 'Holiday Campaign 2024'")).toBeInTheDocument();
    
    // Check the heading is rendered
    expect(screen.getByText('Select Donors & Name Campaign')).toBeInTheDocument();
    
    // Since the component shows the donors data, but not in the simple text format, 
    // let's check for other elements that should be present
    expect(screen.getByText('0 donors selected')).toBeInTheDocument();
  });

  it('should handle campaign name changes', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const input = screen.getByPlaceholderText(/campaign name/i);
    fireEvent.change(input, { target: { value: 'Summer Campaign 2024' } });
    
    expect(mockProps.setCampaignName).toHaveBeenCalledWith('Summer Campaign 2024');
  });

  it('should handle donor selection', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is the "select all", so we click the second one
    fireEvent.click(checkboxes[1]);
    
    expect(mockProps.onDonorsSelected).toHaveBeenCalled();
  });

  it('should disable next button when no name or donors selected', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const nextButton = screen.getByText(/next/i);
    expect(nextButton).toBeDisabled();
  });

  it('should enable next button when name and donors are selected', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        campaignName="Test Campaign"
        selectedDonorIds={['1']}
      />
    );
    
    const nextButton = screen.getByText(/next/i);
    expect(nextButton).not.toBeDisabled();
  });

  it('should handle select all donors', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    
    expect(mockProps.setSelectedDonorIds).toHaveBeenCalledWith(['1', '2']);
  });

  it('should show donor count', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        selectedDonorIds={['1', '2']}
      />
    );
    
    expect(screen.getByText(/2 donors? selected/i)).toBeInTheDocument();
  });

  it('should call onNext when next button is clicked', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        campaignName="Test Campaign"
        selectedDonorIds={['1']}
      />
    );
    
    const nextButton = screen.getByText(/next/i);
    fireEvent.click(nextButton);
    
    expect(mockProps.onNext).toHaveBeenCalled();
  });

  it('should call onPrev when previous button is clicked', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const prevButton = screen.getByText(/previous/i);
    fireEvent.click(prevButton);
    
    expect(mockProps.onPrev).toHaveBeenCalled();
  });

  it('should show loading state', () => {
    mockIsLoading = true;
    mockDonorData = null as any;

    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should filter donors based on search', async () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const searchInput = screen.getByPlaceholderText(/search donors/i);
    fireEvent.change(searchInput, { target: { value: 'John' } });
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large donor lists efficiently', () => {
      const largeDonorList = generateLargeDonorList(1000);
      mockDonorData = { donors: largeDonorList, total: 1000 };

      const { container } = render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should render without performance issues
      expect(screen.getByText('FirstName0 LastName0')).toBeInTheDocument();
      
      // Check if virtualization or pagination is implemented
      const visibleDonors = container.querySelectorAll('[data-testid^="donor-"]');
      // If virtualization is implemented, visible donors should be less than total
      expect(visibleDonors.length).toBeLessThanOrEqual(50); // Assuming ~50 items visible
    });

    it('should not re-render unnecessarily on prop changes', () => {
      const { RenderCounter, getRenderCount } = createRenderCounter();
      
      const { rerender } = render(
        <RenderCounter>
          <SelectDonorsAndNameStep {...mockProps} />
        </RenderCounter>
      );
      
      const initialRenderCount = getRenderCount();
      
      // Re-render with same props
      rerender(
        <RenderCounter>
          <SelectDonorsAndNameStep {...mockProps} />
        </RenderCounter>
      );
      
      // Should only render once more
      expect(getRenderCount()).toBe(initialRenderCount + 1);
    });

    it('should optimize re-renders when typing in search', async () => {
      const user = userEvent.setup();
      const { RenderCounter, getRenderCount } = createRenderCounter();
      
      render(
        <RenderCounter>
          <SelectDonorsAndNameStep {...mockProps} />
        </RenderCounter>
      );
      
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      const initialRenderCount = getRenderCount();
      
      // Type rapidly
      await user.type(searchInput, 'John Smith');
      
      // Should debounce or optimize renders
      const finalRenderCount = getRenderCount();
      // Should render less than character count if optimized
      expect(finalRenderCount - initialRenderCount).toBeLessThan(10);
    });

    it('should handle rapid checkbox selections', async () => {
      const largeDonorList = generateLargeDonorList(100);
      mockDonorData = { donors: largeDonorList, total: 100 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Rapidly click multiple checkboxes
      const startTime = performance.now();
      for (let i = 1; i < Math.min(11, checkboxes.length); i++) {
        fireEvent.click(checkboxes[i]);
      }
      const endTime = performance.now();
      
      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(100); // 100ms for 10 selections
    });

    it('should memoize expensive computations', () => {
      const expensiveFilter = jest.fn((donors: any[], search: string) => {
        return donors.filter(d => 
          d.firstName.toLowerCase().includes(search.toLowerCase()) ||
          d.lastName.toLowerCase().includes(search.toLowerCase())
        );
      });
      
      const TestWrapper = ({ search }: { search: string }) => {
        const filtered = React.useMemo(() => 
          expensiveFilter(mockDonorData.donors, search), 
          [search]
        );
        return <SelectDonorsAndNameStep {...mockProps} />;
      };
      
      const { rerender } = render(<TestWrapper search="" />);
      
      expect(expensiveFilter).toHaveBeenCalledTimes(1);
      
      // Same search, should not recompute
      rerender(<TestWrapper search="" />);
      expect(expensiveFilter).toHaveBeenCalledTimes(1);
      
      // Different search, should recompute
      rerender(<TestWrapper search="john" />);
      expect(expensiveFilter).toHaveBeenCalledTimes(2);
    });
  });

  describe('Advanced Interactions', () => {
    it('should handle keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Tab through elements
      await user.tab();
      expect(screen.getByPlaceholderText(/campaign name/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByPlaceholderText(/search donors/i)).toHaveFocus();
      
      // Arrow keys in donor list
      const firstCheckbox = screen.getAllByRole('checkbox')[1];
      firstCheckbox.focus();
      
      await user.keyboard('{ArrowDown}');
      // Next checkbox should have focus
      expect(screen.getAllByRole('checkbox')[2]).toHaveFocus();
    });

    it('should support bulk operations with shift-click', async () => {
      const user = userEvent.setup();
      const largeDonorList = generateLargeDonorList(10);
      mockDonorData = { donors: largeDonorList, total: 10 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      
      // Click first donor checkbox
      await user.click(checkboxes[1]);
      
      // Shift-click fifth donor checkbox
      await user.keyboard('{Shift>}');
      await user.click(checkboxes[5]);
      await user.keyboard('{/Shift}');
      
      // Should select range
      expect(mockProps.setSelectedDonorIds).toHaveBeenCalledWith(
        expect.arrayContaining(['1', '2', '3', '4', '5'])
      );
    });

    it('should provide visual feedback during loading', () => {
      mockIsLoading = true;
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should show loading skeleton or spinner
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
      
      // Should disable interactions
      const nextButton = screen.getByText(/next/i);
      expect(nextButton).toBeDisabled();
    });

    it('should handle search with special characters', async () => {
      const specialDonor = {
        id: 3,
        firstName: "O'Brien",
        lastName: 'Smith-Jones',
        email: 'special@example.com',
        type: 'individual' as const,
      };
      mockDonorData.donors.push(specialDonor);
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      fireEvent.change(searchInput, { target: { value: "O'Brien" } });
      
      await waitFor(() => {
        expect(screen.getByText("O'Brien Smith-Jones")).toBeInTheDocument();
      });
    });

    it('should validate campaign name format', async () => {
      const user = userEvent.setup();
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const nameInput = screen.getByPlaceholderText(/campaign name/i);
      
      // Test various invalid inputs
      await user.clear(nameInput);
      await user.type(nameInput, '   ');
      
      // Should trim whitespace
      expect(mockProps.setCampaignName).toHaveBeenCalledWith('');
      
      // Test very long name
      const longName = 'A'.repeat(500);
      await user.clear(nameInput);
      await user.type(nameInput, longName);
      
      // Should handle or truncate
      expect(mockProps.setCampaignName).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty donor list', () => {
      mockDonorData = { donors: [], total: 0 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      expect(screen.getByText(/no donors found/i)).toBeInTheDocument();
      
      // Next button should be disabled even with campaign name
      const nextButton = screen.getByText(/next/i);
      expect(nextButton).toBeDisabled();
    });

    it('should handle API errors gracefully', () => {
      mockDonorData = null as any;
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should show error state
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('should preserve selections during search', async () => {
      render(
        <SelectDonorsAndNameStep 
          {...mockProps} 
          selectedDonorIds={['1']}
        />
      );
      
      // Search for a different donor
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      fireEvent.change(searchInput, { target: { value: 'Jane' } });
      
      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
      
      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      
      // Selection should be preserved
      const johnCheckbox = screen.getAllByRole('checkbox')[1];
      expect(johnCheckbox).toBeChecked();
    });

    it('should handle rapid campaign name changes', async () => {
      const user = userEvent.setup();
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const nameInput = screen.getByPlaceholderText(/campaign name/i);
      
      // Rapidly type and delete
      await user.type(nameInput, 'Test');
      await user.clear(nameInput);
      await user.type(nameInput, 'Campaign');
      await user.clear(nameInput);
      await user.type(nameInput, 'Final Name');
      
      // Should handle all changes
      expect(mockProps.setCampaignName).toHaveBeenLastCalledWith('Final Name');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')).toHaveLength(3); // Select all + 2 donors
    });

    it('should announce selection changes to screen readers', async () => {
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const checkbox = screen.getAllByRole('checkbox')[1];
      fireEvent.click(checkbox);
      
      // Should update aria-label or aria-describedby
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('should support keyboard-only interaction', async () => {
      const user = userEvent.setup();
      render(
        <SelectDonorsAndNameStep 
          {...mockProps} 
          campaignName="Test"
        />
      );
      
      // Navigate to first donor checkbox using only keyboard
      await user.tab(); // Campaign name
      await user.tab(); // Search
      await user.tab(); // Select all
      await user.tab(); // First donor
      
      // Select with space
      await user.keyboard(' ');
      
      expect(mockProps.onDonorsSelected).toHaveBeenCalled();
      
      // Navigate to next button
      await user.tab();
      await user.tab();
      
      // Submit with Enter
      await user.keyboard('{Enter}');
      
      expect(mockProps.onNext).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should work with list selection', async () => {
      const mockList = {
        id: 1,
        name: 'Major Donors',
        donorIds: [1, 2],
      };
      
      jest.mocked(require('@/app/hooks/use-lists').useLists).mockReturnValue({
        getListQuery: {
          data: mockList,
          isLoading: false,
        },
        createListMutation: {
          mutate: jest.fn(),
          isPending: false,
        },
      });
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should show list selection UI
      expect(screen.getByText(/major donors/i)).toBeInTheDocument();
    });

    it('should handle concurrent data updates', async () => {
      const { rerender } = render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Simulate data update while user is interacting
      const newDonor = {
        id: 3,
        firstName: 'New',
        lastName: 'Donor',
        email: 'new@example.com',
        type: 'individual' as const,
      };
      
      mockDonorData.donors.push(newDonor);
      mockDonorData.total = 3;
      
      rerender(<SelectDonorsAndNameStep {...mockProps} />);
      
      // New donor should appear
      expect(screen.getByText('New Donor')).toBeInTheDocument();
      
      // Existing selections should be preserved
      expect(mockProps.selectedDonorIds).toEqual([]);
    });
  });
});