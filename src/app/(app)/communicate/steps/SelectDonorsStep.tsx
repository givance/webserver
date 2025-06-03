"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "use-debounce";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDonors } from "@/app/hooks/use-donors";

interface SelectDonorsStepProps {
  selectedDonors: number[];
  onDonorsSelected: (donorIds: number[]) => void;
  onNext: () => void;
}

export function SelectDonorsStep({ selectedDonors, onDonorsSelected, onNext }: SelectDonorsStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

  const { listDonors } = useDonors();
  const { data: donorsData, isLoading } = listDonors({
    searchTerm: debouncedSearchTerm,
  });

  const handleToggleDonor = (donorId: number) => {
    const newSelectedDonors = selectedDonors.includes(donorId)
      ? selectedDonors.filter((id) => id !== donorId)
      : [...selectedDonors, donorId];
    onDonorsSelected(newSelectedDonors);
  };

  const handleSelectAll = () => {
    if (!donorsData?.donors) return;
    const allDonorIds = donorsData.donors.map((donor) => donor.id);
    onDonorsSelected(allDonorIds);
  };

  const handleClearAll = () => {
    onDonorsSelected([]);
  };

  const displayedCount = donorsData?.donors?.length || 0;
  const totalCount = donorsData?.totalCount || 0;
  const hasMoreDonors = totalCount > displayedCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search donors by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" onClick={handleClearAll}>
          Clear All
        </Button>
      </div>

      <ScrollArea className="h-[300px] border rounded-md p-4">
        {isLoading ? (
          <div>Loading donors...</div>
        ) : (
          <div className="space-y-2">
            {donorsData?.donors?.map((donor) => (
              <div key={donor.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`donor-${donor.id}`}
                  checked={selectedDonors.includes(donor.id)}
                  onCheckedChange={() => handleToggleDonor(donor.id)}
                />
                <label
                  htmlFor={`donor-${donor.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {donor.firstName} {donor.lastName} ({donor.email})
                </label>
              </div>
            ))}
            {donorsData?.donors?.length === 0 && <div className="text-sm text-muted-foreground">No donors found</div>}
          </div>
        )}
      </ScrollArea>

      <div className="flex justify-between items-center pt-4">
        <div className="text-sm text-muted-foreground">
          {selectedDonors.length} donors selected
          {totalCount > 0 && <span className="ml-2">• {totalCount} total donors</span>}
        </div>
        <Button onClick={onNext} disabled={selectedDonors.length === 0}>
          Next
        </Button>
      </div>
    </div>
  );
}
