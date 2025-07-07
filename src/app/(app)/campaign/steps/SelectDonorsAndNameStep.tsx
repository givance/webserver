'use client';

import { useCampaignAutoSave } from '@/app/hooks/use-campaign-auto-save';
import { useDonorStaffEmailValidation } from '@/app/hooks/use-donor-validation';
import { useDonors } from '@/app/hooks/use-donors';
import { useLists } from '@/app/hooks/use-lists';
import { formatDonorName } from '@/app/lib/utils/donor-name-formatter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ArrowRight, Check, List, Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';

interface SelectDonorsAndNameStepProps {
  selectedDonors: number[];
  onDonorsSelected: (donorIds: number[]) => void;
  campaignName: string;
  onCampaignNameChange: (campaignName: string) => void;
  onNext: (campaignName: string) => void | Promise<void>;
  // Auto-save props
  sessionId?: number;
  onSessionIdChange?: (sessionId: number) => void;
  templateId?: number;
}

// Generate a default campaign name based on current date
const generateDefaultCampaignName = (): string => {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();
  return `${month} ${year} Campaign`;
};

export function SelectDonorsAndNameStep({
  selectedDonors,
  onDonorsSelected,
  campaignName,
  onCampaignNameChange,
  onNext,
  sessionId,
  onSessionIdChange,
  templateId,
}: SelectDonorsAndNameStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [selectedLists, setSelectedLists] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'donors' | 'lists'>('donors');
  const [localCampaignName, setLocalCampaignName] = useState(campaignName);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Use the validation hook
  const { data: validationResult, isLoading: isValidating } =
    useDonorStaffEmailValidation(selectedDonors);

  // Auto-save hook
  const { autoSave, isSaving } = useCampaignAutoSave({
    onSessionIdChange,
  });

  // Initialize with default campaign name if empty
  useEffect(() => {
    if (!localCampaignName.trim()) {
      const defaultName = generateDefaultCampaignName();
      setLocalCampaignName(defaultName);
      onCampaignNameChange(defaultName);
    }
  }, [localCampaignName, onCampaignNameChange]);

  // Auto-save when campaign name or selected donors change
  useEffect(() => {
    if (localCampaignName && selectedDonors.length > 0) {
      autoSave({
        sessionId,
        campaignName: localCampaignName,
        selectedDonorIds: selectedDonors,
        templateId,
      });
    }
  }, [localCampaignName, selectedDonors, sessionId, templateId, autoSave]);

  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [debouncedListSearchTerm] = useDebounce(listSearchTerm, 500);

  const { listDonorsForCommunication } = useDonors();
  const { listDonorLists, getDonorIdsFromListsQuery } = useLists();

  const { data: donorsData, isLoading: isDonorsLoading } = listDonorsForCommunication({
    searchTerm: debouncedSearchTerm,
  });

  const { data: listsData, isLoading: isListsLoading } = listDonorLists({
    searchTerm: debouncedListSearchTerm,
    isActive: true,
  });

  // Get donor IDs from selected lists
  const { data: donorIdsFromLists } = getDonorIdsFromListsQuery(selectedLists);

  // Update selected donors when lists change
  useEffect(() => {
    if (donorIdsFromLists && selectedLists.length > 0) {
      // Add all donors from the selected lists to the selection
      const newSelectedDonors = [...new Set([...selectedDonors, ...donorIdsFromLists])];
      onDonorsSelected(newSelectedDonors);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorIdsFromLists, selectedLists]); // selectedDonors and onDonorsSelected intentionally omitted to prevent loops

  const handleToggleDonor = (donorId: number) => {
    // Simple toggle - if selected, remove; if not selected, add
    const newSelectedDonors = selectedDonors.includes(donorId)
      ? selectedDonors.filter((id) => id !== donorId)
      : [...selectedDonors, donorId];
    onDonorsSelected(newSelectedDonors);
  };

  const handleToggleList = (listId: number) => {
    const newSelectedLists = selectedLists.includes(listId)
      ? selectedLists.filter((id) => id !== listId)
      : [...selectedLists, listId];
    setSelectedLists(newSelectedLists);
  };

  const handleSelectAllDonors = () => {
    if (!donorsData?.donors) return;
    const allDonorIds = donorsData.donors.map((donor) => donor.id);
    onDonorsSelected([...new Set([...selectedDonors, ...allDonorIds])]);
  };

  const handleSelectAllLists = () => {
    if (!listsData?.lists) return;
    const allListIds = listsData.lists.map((list) => list.id);
    setSelectedLists(allListIds);
  };

  const handleClearAll = () => {
    onDonorsSelected([]);
    setSelectedLists([]);
  };

  const handleCampaignNameChange = (value: string) => {
    setLocalCampaignName(value);
    onCampaignNameChange(value);
    if (error) {
      setError('');
    }
  };

  const handleNext = async () => {
    if (!localCampaignName.trim()) {
      setError('Campaign name is required');
      return;
    }
    if (localCampaignName.trim().length > 255) {
      setError('Campaign name must be 255 characters or less');
      return;
    }
    if (selectedDonors.length === 0) {
      setError('Please select at least one donor');
      return;
    }

    setError('');
    setIsProcessing(true);

    try {
      const trimmedName = localCampaignName.trim();
      await onNext(trimmedName);
    } catch (error) {
      console.error('Error in handleNext:', error);
      setError('Failed to save campaign. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const displayedDonorCount = donorsData?.donors?.length || 0;
  const totalDonorCount = donorsData?.totalCount || 0;
  const displayedListCount = listsData?.lists?.length || 0;
  const totalListCount = listsData?.totalCount || 0;

  const donorsFromLists =
    donorIdsFromLists?.filter((id) => selectedDonors.includes(id)).length || 0;
  const individualDonors = selectedDonors.filter((id) => !donorIdsFromLists?.includes(id)).length;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Compact Navigation Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Select Donors & Name Campaign</h2>
        <Button
          onClick={handleNext}
          disabled={!localCampaignName.trim() || selectedDonors.length === 0 || isProcessing}
          size="sm"
          className="h-7 text-xs"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>
      </div>

      {/* Campaign Name Input - simplified without card */}
      <div className="space-y-3 p-4 border rounded-lg bg-card">
        <div className="flex items-center justify-between">
          <Label htmlFor="campaignName" className="text-sm font-medium">
            Campaign Name
          </Label>
          {isSaving && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {!isSaving && localCampaignName.trim() !== '' && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              <span>Saved</span>
            </div>
          )}
        </div>
        <Input
          id="campaignName"
          placeholder="e.g., 'Holiday Campaign 2024'"
          value={localCampaignName}
          onChange={(e) => handleCampaignNameChange(e.target.value)}
          className={error ? 'border-red-500' : ''}
          maxLength={255}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{localCampaignName.length}/255 characters</span>
          <span>{selectedDonors.length} donors selected</span>
        </div>
      </div>

      {/* Validation Alert - compact */}
      {validationResult && !validationResult.isValid && (
        <Alert variant="destructive" className="py-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <p className="font-medium">⚠️ Setup issues:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
              {validationResult.donorsWithoutStaff.length > 0 && (
                <li>
                  {validationResult.donorsWithoutStaff.length} donor(s) need staff assignments
                </li>
              )}
              {validationResult.donorsWithStaffButNoEmail.length > 0 && (
                <li>
                  {validationResult.donorsWithStaffButNoEmail.length} staff member(s) need Gmail
                  connection
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Donor Selection - more compact */}
      <div className="border rounded-lg bg-card">
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Select Donors</span>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'donors' | 'lists')}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="donors" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                Individual
              </TabsTrigger>
              <TabsTrigger value="lists" className="text-xs">
                <List className="h-3 w-3 mr-1" />
                Lists
              </TabsTrigger>
            </TabsList>

            <TabsContent value="donors" className="space-y-3 mt-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search donors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleSelectAllDonors}>
                  Select All
                </Button>
              </div>

              <ScrollArea className="h-[160px] border rounded p-3">
                {isDonorsLoading ? (
                  <div className="text-sm">Loading donors...</div>
                ) : (
                  <div className="space-y-2">
                    {donorsData?.donors?.map((donor) => {
                      const isDonorFromLists = donorIdsFromLists?.includes(donor.id) || false;
                      const isSelected = selectedDonors.includes(donor.id);

                      return (
                        <div key={donor.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`donor-${donor.id}`}
                              checked={isSelected}
                              onCheckedChange={() => handleToggleDonor(donor.id)}
                            />
                            <label htmlFor={`donor-${donor.id}`} className="text-xs leading-none">
                              {formatDonorName(donor)} ({donor.email})
                            </label>
                          </div>
                          {isDonorFromLists && (
                            <Badge variant="secondary" className="text-xs py-0 px-1">
                              From List
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    {donorsData?.donors?.length === 0 && (
                      <div className="text-xs text-muted-foreground">No donors found</div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="text-xs text-muted-foreground">
                Showing {displayedDonorCount} of {totalDonorCount} donors
              </div>
            </TabsContent>

            <TabsContent value="lists" className="space-y-3 mt-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search lists..."
                  value={listSearchTerm}
                  onChange={(e) => setListSearchTerm(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleSelectAllLists}>
                  Select All
                </Button>
              </div>

              <ScrollArea className="h-[160px] border rounded p-3">
                {isListsLoading ? (
                  <div className="text-sm">Loading lists...</div>
                ) : (
                  <div className="space-y-2">
                    {listsData?.lists?.map((list) => (
                      <div key={list.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`list-${list.id}`}
                            checked={selectedLists.includes(list.id)}
                            onCheckedChange={() => handleToggleList(list.id)}
                          />
                          <label htmlFor={`list-${list.id}`} className="text-xs leading-none">
                            {list.name}
                            {list.description && (
                              <span className="text-muted-foreground ml-1">
                                - {list.description}
                              </span>
                            )}
                          </label>
                        </div>
                        <Badge variant="outline" className="text-xs py-0 px-1">
                          {list.memberCount}
                        </Badge>
                      </div>
                    ))}
                    {listsData?.lists?.length === 0 && (
                      <div className="text-xs text-muted-foreground">No lists found</div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="text-xs text-muted-foreground">
                Showing {displayedListCount} of {totalListCount} lists
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Summary - compact */}
        <div className="px-4 pb-4">
          <div className="p-3 bg-muted/30 rounded text-xs">
            <div className="font-medium">{selectedDonors.length} total donors selected</div>
            {selectedLists.length > 0 && donorsFromLists > 0 && (
              <div className="text-muted-foreground">
                • {donorsFromLists} from {selectedLists.length} list
                {selectedLists.length !== 1 ? 's' : ''}
              </div>
            )}
            {individualDonors > 0 && (
              <div className="text-muted-foreground">
                • {individualDonors} individual donor{individualDonors !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Clear All Button */}
      <div className="pt-2">
        <Button variant="outline" onClick={handleClearAll} size="sm" className="h-7 text-xs">
          Clear All
        </Button>
      </div>
    </div>
  );
}
