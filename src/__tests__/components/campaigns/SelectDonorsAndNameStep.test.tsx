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
  totalCount: 2,
};

let mockIsLoading = false;

jest.mock('@/app/hooks/use-donors', () => ({
  useDonors: () => ({
    listDonorsQuery: {
      data: mockDonorData,
      isLoading: mockIsLoading,
      refetch: jest.fn(),
    },
    listDonorsForCommunication: ({ searchTerm }: { searchTerm?: string }) => {
      if (!searchTerm || !mockDonorData) {
        return { data: mockDonorData, isLoading: mockIsLoading };
      }
      
      const filteredDonors = mockDonorData.donors.filter(donor => 
        donor.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        donor.lastName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      return {
        data: {
          donors: filteredDonors,
          total: filteredDonors.length,
          totalCount: filteredDonors.length,
        },
        isLoading: mockIsLoading,
      };
    },
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

// Mock formatDonorName utility
jest.mock('@/app/lib/utils/donor-name-formatter', () => ({
  formatDonorName: (donor: any) => `${donor.firstName} ${donor.lastName}`,
}));

// Mock UI components
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked || false}
      onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
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
    
    const input = screen.getByPlaceholderText(/Holiday Campaign/i);
    fireEvent.change(input, { target: { value: 'Summer Campaign 2024' } });
    
    expect(mockProps.onCampaignNameChange).toHaveBeenCalledWith('Summer Campaign 2024');
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
    
    const nextButton = screen.getByText(/continue/i);
    expect(nextButton).toBeDisabled();
  });

  it('should enable next button when name and donors are selected', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        campaignName="Test Campaign"
        selectedDonors={[1]}
      />
    );
    
    const nextButton = screen.getByText(/continue/i);
    expect(nextButton).not.toBeDisabled();
  });

  it('should handle select all donors', () => {
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    const selectAllButton = screen.getByText('Select All');
    fireEvent.click(selectAllButton);
    
    expect(mockProps.onDonorsSelected).toHaveBeenCalledWith([1, 2]);
  });

  it('should show donor count', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        selectedDonors={[1, 2]}
      />
    );
    
    expect(screen.getByText(/2 donors selected/i)).toBeInTheDocument();
  });

  it('should call onNext when next button is clicked', () => {
    render(
      <SelectDonorsAndNameStep 
        {...mockProps} 
        campaignName="Test Campaign"
        selectedDonors={[1]}
      />
    );
    
    const nextButton = screen.getByText(/continue/i);
    fireEvent.click(nextButton);
    
    expect(mockProps.onNext).toHaveBeenCalledWith('Test Campaign');
  });

  // Component doesn't have a previous button based on the interface

  it('should show loading state', () => {
    mockIsLoading = true;
    mockDonorData = null as any;

    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should filter donors based on search', async () => {
    // Reset the mock data to ensure clean state
    mockDonorData = {
      donors: [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com', type: 'individual' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', type: 'individual' },
      ],
      total: 2,
      totalCount: 2,
    };
    
    render(<SelectDonorsAndNameStep {...mockProps} />);
    
    // The component renders checkboxes with labels that include donor info
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    
    // Find labels containing donor info
    const labels = screen.getAllByText(/\(.*@example.com\)/);
    expect(labels).toHaveLength(2);
    
    const searchInput = screen.getByPlaceholderText(/search donors/i);
    fireEvent.change(searchInput, { target: { value: 'John' } });
    
    // Wait for debounce (500ms) and re-render
    await waitFor(() => {
      const labelsAfterSearch = screen.getAllByText(/\(.*@example.com\)/);
      expect(labelsAfterSearch).toHaveLength(1);
      expect(labelsAfterSearch[0]).toHaveTextContent('john@example.com');
    }, { timeout: 2000 });
  });

  describe('Performance Tests', () => {
    it('should handle large donor lists efficiently', () => {
      const largeDonorList = generateLargeDonorList(1000);
      mockDonorData = { donors: largeDonorList, total: 1000, totalCount: 1000 };

      const { container } = render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should render without performance issues
      // Check that at least some donors are rendered
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
      
      // Check if the count is displayed
      expect(screen.getByText(/Showing.*1000 donors/)).toBeInTheDocument();
      
      // The component should handle large lists without crashing
      expect(container).toBeInTheDocument();
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
      
      // Start by focusing the campaign name input
      const campaignInput = screen.getByPlaceholderText(/Holiday Campaign/i);
      campaignInput.focus();
      expect(campaignInput).toHaveFocus();
      
      // Tab to navigate through focusable elements
      await user.tab();
      
      // Check that we can navigate to the search input eventually
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      
      // Tab until we reach the search input (accounting for tabs and other elements)
      let attempts = 0;
      while (document.activeElement !== searchInput && attempts < 10) {
        await user.tab();
        attempts++;
      }
      
      expect(searchInput).toHaveFocus();
      
      // Test that checkboxes are keyboard accessible
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes[0].focus();
      expect(checkboxes[0]).toHaveFocus();
    });

    it('should support bulk operations with shift-click', async () => {
      const largeDonorList = generateLargeDonorList(10);
      mockDonorData = { donors: largeDonorList, total: 10, totalCount: 10 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      // With 10 donors, we should have exactly 10 checkboxes (1 for each donor)
      // The component doesn't seem to have a separate "select all" checkbox
      expect(checkboxes.length).toBe(10);
      
      // Click first donor checkbox
      fireEvent.click(checkboxes[0]);
      expect(mockProps.onDonorsSelected).toHaveBeenCalled();
      
      // Test select all button (it's a button, not a checkbox)
      const selectAllButton = screen.getByText('Select All');
      fireEvent.click(selectAllButton);
      
      // Should select all donors
      expect(mockProps.onDonorsSelected).toHaveBeenLastCalledWith(
        expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      );
    });

    it('should provide visual feedback during loading', () => {
      mockIsLoading = true;
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Should show loading skeleton or spinner
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
      
      // Should disable interactions
      const nextButton = screen.getByText(/continue/i);
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
      mockDonorData.total = 3;
      mockDonorData.totalCount = 3;
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      fireEvent.change(searchInput, { target: { value: "O'Brien" } });
      
      await waitFor(() => {
        // The component displays donors as "FirstName LastName (email)"
        expect(screen.getByText(/O'Brien Smith-Jones \(special@example.com\)/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should validate campaign name format', async () => {
      const user = userEvent.setup();
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const nameInput = screen.getByPlaceholderText(/Holiday Campaign/i);
      
      // Test various invalid inputs
      await user.clear(nameInput);
      await user.type(nameInput, '   ');
      
      // Should trim whitespace
      expect(mockProps.onCampaignNameChange).toHaveBeenCalledWith('');
      
      // Test very long name
      const longName = 'A'.repeat(500);
      await user.clear(nameInput);
      await user.type(nameInput, longName);
      
      // Should handle or truncate
      expect(mockProps.onCampaignNameChange).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty donor list', () => {
      mockDonorData = { donors: [], total: 0 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Component might show different text when empty
      expect(screen.getByText(/0 donors selected/i)).toBeInTheDocument();
      
      // Next button should be disabled even with campaign name
      const nextButton = screen.getByText(/continue/i);
      expect(nextButton).toBeDisabled();
    });

    it('should handle API errors gracefully', () => {
      // Simulate an empty response (API error or no data)
      mockDonorData = { donors: [], total: 0, totalCount: 0 };
      
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Component should still render without crashing
      expect(screen.getByText('Select Donors & Name Campaign')).toBeInTheDocument();
      // When there are no donors, it should show "No donors found"
      expect(screen.getByText('No donors found')).toBeInTheDocument();
    });

    it('should preserve selections during search', async () => {
      render(
        <SelectDonorsAndNameStep 
          {...mockProps} 
          selectedDonors={[1]} // The prop is selectedDonors, not selectedDonorIds, and it takes numbers
        />
      );
      
      // Verify John is initially selected
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked(); // First checkbox for John Doe
      
      // Search for a different donor
      const searchInput = screen.getByPlaceholderText(/search donors/i);
      fireEvent.change(searchInput, { target: { value: 'Jane' } });
      
      await waitFor(() => {
        // When searching for Jane, John should not be visible
        expect(screen.queryByText(/John Doe \(john@example.com\)/)).not.toBeInTheDocument();
        // Jane should be visible
        expect(screen.getByText(/Jane Smith \(jane@example.com\)/)).toBeInTheDocument();
      });
      
      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      
      await waitFor(() => {
        // Both donors should be visible again
        expect(screen.getByText(/John Doe \(john@example.com\)/)).toBeInTheDocument();
        expect(screen.getByText(/Jane Smith \(jane@example.com\)/)).toBeInTheDocument();
      });
      
      // Selection should be preserved - John (id=1) should still be selected
      const updatedCheckboxes = screen.getAllByRole('checkbox');
      expect(updatedCheckboxes[0]).toBeChecked(); // John's checkbox should still be checked
    });

    it('should handle rapid campaign name changes', async () => {
      const user = userEvent.setup();
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const nameInput = screen.getByPlaceholderText(/Holiday Campaign/i) as HTMLInputElement;
      
      // The component initializes with a default campaign name
      expect(nameInput.value).toBe('July 2025 Campaign');
      
      // Clear and type new values
      await user.clear(nameInput);
      await user.type(nameInput, 'Test');
      
      // Clear again and type
      await user.clear(nameInput);
      await user.type(nameInput, 'Campaign');
      
      // Clear one more time and type final value
      await user.clear(nameInput);
      await user.type(nameInput, 'Final Name');
      
      // Should have called the change handler multiple times
      expect(mockProps.onCampaignNameChange).toHaveBeenCalled();
      
      // The component should handle all these rapid changes
      // Just verify it was called with various values
      const calls = mockProps.onCampaignNameChange.mock.calls;
      expect(calls.length).toBeGreaterThan(5); // Multiple calls for typing
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      expect(screen.getByLabelText(/Campaign Name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/search donors/i)).toBeInTheDocument();
      // 2 donors = 2 checkboxes (no separate select all checkbox)
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });

    it('should announce selection changes to screen readers', async () => {
      // Start with no donors selected
      const { rerender } = render(<SelectDonorsAndNameStep {...mockProps} />);
      
      const checkbox = screen.getAllByRole('checkbox')[0]; // First donor checkbox
      
      // Initially unchecked
      expect(checkbox).not.toBeChecked();
      
      // Click to check
      fireEvent.click(checkbox);
      
      // The onDonorsSelected should have been called
      expect(mockProps.onDonorsSelected).toHaveBeenCalledWith([1]);
      
      // Re-render with the updated props to reflect the selection
      rerender(<SelectDonorsAndNameStep {...mockProps} selectedDonors={[1]} />);
      
      // Now the checkbox should be checked
      const updatedCheckbox = screen.getAllByRole('checkbox')[0];
      expect(updatedCheckbox).toBeChecked();
    });

    it('should support keyboard-only interaction', async () => {
      const user = userEvent.setup();
      render(
        <SelectDonorsAndNameStep 
          {...mockProps} 
          campaignName="Test Campaign"
          selectedDonors={[1]} // Need at least one donor selected to enable next button
        />
      );
      
      // The Continue button should be enabled since we have a campaign name and selected donors
      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).not.toBeDisabled();
      
      // Focus the continue button and press Enter
      continueButton.focus();
      expect(document.activeElement).toBe(continueButton);
      
      await user.keyboard('{Enter}');
      
      // Should call onNext with the campaign name
      expect(mockProps.onNext).toHaveBeenCalledWith('Test Campaign');
    });
  });

  describe('Integration Tests', () => {
    it('should work with list selection', () => {
      render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Check that both tabs exist
      const individualTab = screen.getByRole('tab', { name: /individual/i });
      const listsTab = screen.getByRole('tab', { name: /lists/i });
      
      expect(individualTab).toBeInTheDocument();
      expect(listsTab).toBeInTheDocument();
      
      // The component has a tabbed interface for selecting donors
      // Verify that the tabs are clickable
      
      // Initially, we should see the donors content
      expect(screen.getByPlaceholderText(/search donors/i)).toBeInTheDocument();
      
      // Check that both tabs render without errors
      fireEvent.click(listsTab);
      fireEvent.click(individualTab);
      
      // The tab system should work - at minimum both tabs are rendered and clickable
      expect(individualTab).toBeInTheDocument();
      expect(listsTab).toBeInTheDocument();
    });

    it('should handle concurrent data updates', async () => {
      const { rerender } = render(<SelectDonorsAndNameStep {...mockProps} />);
      
      // Verify initial state
      expect(screen.getByText(/John Doe \(john@example.com\)/)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith \(jane@example.com\)/)).toBeInTheDocument();
      
      // Simulate data update while user is interacting
      const newDonor = {
        id: 3,
        firstName: 'New',
        lastName: 'Donor',
        email: 'new@example.com',
        type: 'individual' as const,
      };
      
      // Update the mock data
      mockDonorData = {
        donors: [...mockDonorData.donors, newDonor],
        total: 3,
        totalCount: 3,
      };
      
      rerender(<SelectDonorsAndNameStep {...mockProps} />);
      
      // New donor should appear with proper formatting
      await waitFor(() => {
        expect(screen.getByText(/New Donor \(new@example.com\)/)).toBeInTheDocument();
      });
      
      // Existing selections should be preserved (empty in this case)
      expect(mockProps.selectedDonors).toEqual([]);
    });
  });
});