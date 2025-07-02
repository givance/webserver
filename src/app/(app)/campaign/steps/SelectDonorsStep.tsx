"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "use-debounce";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDonors } from "@/app/hooks/use-donors";
import { useLists } from "@/app/hooks/use-lists";
import { formatDonorName } from "@/app/lib/utils/donor-name-formatter";
import { useCampaignAutoSave } from "@/app/hooks/use-campaign-auto-save";
import { Users, List, Check, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { useDonorStaffEmailValidation, type DonorEmailValidationResult } from "@/app/hooks/use-donor-validation";

interface SelectDonorsStepProps {
  selectedDonors: number[];
  onDonorsSelected: (donorIds: number[]) => void;
  onNext: () => void;
  // Auto-save props
  sessionId?: number;
  onSessionIdChange?: (sessionId: number) => void;
  campaignName?: string;
  templateId?: number;
}

export function SelectDonorsStep({
  selectedDonors,
  onDonorsSelected,
  onNext,
  sessionId,
  onSessionIdChange,
  campaignName,
  templateId,
}: SelectDonorsStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [listSearchTerm, setListSearchTerm] = useState("");
  const [selectedLists, setSelectedLists] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<"donors" | "lists">("donors");
  const prevDonorIdsFromListsRef = useRef<number[]>([]);
  const selectedDonorsRef = useRef<number[]>(selectedDonors);

  // Use the validation hook
  const { data: validationResult, isLoading: isValidating } = useDonorStaffEmailValidation(selectedDonors);

  // Auto-save hook
  const { autoSave, isSaving } = useCampaignAutoSave({
    onSessionIdChange,
  });

  // Keep ref in sync with prop
  useEffect(() => {
    selectedDonorsRef.current = selectedDonors;
  }, [selectedDonors]);

  // Auto-save when selected donors change
  useEffect(() => {
    if (campaignName && selectedDonors.length > 0) {
      autoSave({
        sessionId,
        campaignName,
        selectedDonorIds: selectedDonors,
        templateId,
      });
    }
  }, [selectedDonors, campaignName, sessionId, templateId, autoSave]);

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
    const currentDonorIdsFromLists = donorIdsFromLists || [];
    const prevDonorIdsFromLists = prevDonorIdsFromListsRef.current;

    // Only proceed if the donor IDs from lists have actually changed
    const listsChanged =
      currentDonorIdsFromLists.length !== prevDonorIdsFromLists.length ||
      !currentDonorIdsFromLists.every((id) => prevDonorIdsFromLists.includes(id));

    if (listsChanged) {
      prevDonorIdsFromListsRef.current = currentDonorIdsFromLists;

      if (selectedLists.length > 0 && currentDonorIdsFromLists.length > 0) {
        // Get current individual donors (not from lists) - use the ref to get current value
        const currentSelectedDonors = selectedDonorsRef.current;
        const individualDonors = currentSelectedDonors.filter((donorId) => !currentDonorIdsFromLists.includes(donorId));
        const combinedDonors = [...new Set([...individualDonors, ...currentDonorIdsFromLists])];
        onDonorsSelected(combinedDonors);
      } else if (selectedLists.length === 0) {
        // If no lists are selected, remove list-based donors but keep individual ones
        const currentSelectedDonors = selectedDonorsRef.current;
        const individualDonors = currentSelectedDonors.filter((donorId) => !prevDonorIdsFromLists.includes(donorId));
        onDonorsSelected(individualDonors);
      }
    }
  }, [donorIdsFromLists, selectedLists, onDonorsSelected]); // Only depend on external data

  const handleToggleDonor = (donorId: number) => {
    // Only allow manual donor selection if not selected via lists
    const isDonorFromLists = donorIdsFromLists?.includes(donorId) || false;

    if (isDonorFromLists) {
      // Don't allow manual deselection of donors from lists
      return;
    }

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

  const displayedDonorCount = donorsData?.donors?.length || 0;
  const totalDonorCount = donorsData?.totalCount || 0;
  const displayedListCount = listsData?.lists?.length || 0;
  const totalListCount = listsData?.totalCount || 0;

  const donorsFromLists = donorIdsFromLists?.length || 0;
  const individualDonors = selectedDonors.length - donorsFromLists;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Select Donors</h3>
        <p className="text-sm text-muted-foreground">
          Choose individual donors or select entire lists to include in your communication campaign.
        </p>
      </div>

      {/* Validation Banner - Removed to prevent UI jumping */}

      {validationResult && !validationResult.isValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">⚠️ Email setup issues detected for selected donors:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {validationResult.donorsWithoutStaff.length > 0 && (
                  <li>
                    <strong>{validationResult.donorsWithoutStaff.length}</strong> donor(s) don&apos;t have assigned
                    staff members
                  </li>
                )}
                {validationResult.donorsWithStaffButNoEmail.length > 0 && (
                  <li>
                    <strong>{validationResult.donorsWithStaffButNoEmail.length}</strong> donor(s) have staff members
                    without connected Gmail accounts
                  </li>
                )}
              </ul>
              <p className="text-sm">
                These issues need to be resolved before emails can be scheduled. Please assign staff to all donors and
                ensure all staff have connected their Gmail accounts in Settings.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "donors" | "lists")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="donors" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Individual Donors
          </TabsTrigger>
          <TabsTrigger value="lists" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Donor Lists
          </TabsTrigger>
        </TabsList>

        <TabsContent value="donors" className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search donors by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSelectAllDonors}>
              Select All
            </Button>
          </div>

          <ScrollArea className="h-[300px] border rounded-md p-4">
            {isDonorsLoading ? (
              <div>Loading donors...</div>
            ) : (
              <div className="space-y-2">
                {donorsData?.donors?.map((donor) => {
                  const isDonorFromLists = donorIdsFromLists?.includes(donor.id) || false;
                  const isSelected = selectedDonors.includes(donor.id);

                  return (
                    <div key={donor.id} className="flex items-center justify-between space-x-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`donor-${donor.id}`}
                          checked={isSelected}
                          onCheckedChange={() => handleToggleDonor(donor.id)}
                          disabled={isDonorFromLists}
                        />
                        <label
                          htmlFor={`donor-${donor.id}`}
                          className={`text-sm font-medium leading-none ${
                            isDonorFromLists
                              ? "text-muted-foreground"
                              : "peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          }`}
                        >
                          {formatDonorName(donor)} ({donor.email})
                        </label>
                      </div>
                      {isDonorFromLists && (
                        <Badge variant="secondary" className="text-xs">
                          From List
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {donorsData?.donors?.length === 0 && (
                  <div className="text-sm text-muted-foreground">No donors found</div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="text-sm text-muted-foreground">
            Showing {displayedDonorCount} of {totalDonorCount} donors
          </div>
        </TabsContent>

        <TabsContent value="lists" className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search lists by name..."
              value={listSearchTerm}
              onChange={(e) => setListSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSelectAllLists}>
              Select All
            </Button>
          </div>

          <ScrollArea className="h-[300px] border rounded-md p-4">
            {isListsLoading ? (
              <div>Loading lists...</div>
            ) : (
              <div className="space-y-2">
                {listsData?.lists?.map((list) => (
                  <div key={list.id} className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`list-${list.id}`}
                        checked={selectedLists.includes(list.id)}
                        onCheckedChange={() => handleToggleList(list.id)}
                      />
                      <label
                        htmlFor={`list-${list.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {list.name}
                        {list.description && <span className="text-muted-foreground ml-1">- {list.description}</span>}
                      </label>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {list.memberCount} {list.memberCount === 1 ? "donor" : "donors"}
                    </Badge>
                  </div>
                ))}
                {listsData?.lists?.length === 0 && <div className="text-sm text-muted-foreground">No lists found</div>}
              </div>
            )}
          </ScrollArea>

          <div className="text-sm text-muted-foreground">
            Showing {displayedListCount} of {totalListCount} lists
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-between items-center pt-4 border-t">
        <div className="space-y-1">
          <div className="text-sm font-medium">{selectedDonors.length} total donors selected</div>
          <div className="text-xs text-muted-foreground space-y-1">
            {selectedLists.length > 0 && (
              <div>
                • {donorsFromLists} from {selectedLists.length} list{selectedLists.length !== 1 ? "s" : ""}
              </div>
            )}
            {individualDonors > 0 && (
              <div>
                • {individualDonors} individual donor{individualDonors !== 1 ? "s" : ""}
              </div>
            )}
            {/* Auto-save indicator */}
            {campaignName && selectedDonors.length > 0 && (
              <div className="flex items-center gap-1">
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Saved</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClearAll}>
            Clear All
          </Button>
          <Button onClick={onNext} disabled={selectedDonors.length === 0}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
