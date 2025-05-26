"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ArrowRight, ArrowLeft } from "lucide-react";

interface JobNameStepProps {
  selectedDonors: number[];
  jobName: string;
  onJobNameChange: (jobName: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function JobNameStep({ selectedDonors, jobName, onJobNameChange, onBack, onNext }: JobNameStepProps) {
  const [localJobName, setLocalJobName] = useState(jobName);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!localJobName.trim()) {
      setError("Job name is required");
      return;
    }
    if (localJobName.trim().length > 255) {
      setError("Job name must be 255 characters or less");
      return;
    }

    setError("");
    onJobNameChange(localJobName.trim());
    onNext();
  };

  const handleJobNameChange = (value: string) => {
    setLocalJobName(value);
    if (error) {
      setError("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Name Your Communication Job</h3>
        <p className="text-sm text-muted-foreground">
          Give this communication campaign a descriptive name to help you identify it later.
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Selected Donors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <p className="text-sm font-medium">Total Donors Selected</p>
            <p className="text-2xl font-bold">{selectedDonors.length}</p>
            <p className="text-sm text-muted-foreground">
              You will be creating personalized emails for {selectedDonors.length} donor
              {selectedDonors.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Job Name Input */}
      <Card>
        <CardHeader>
          <CardTitle>Job Name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jobName">Communication Job Name</Label>
            <Input
              id="jobName"
              placeholder="e.g., Holiday Thank You Campaign, Q4 Donor Outreach, etc."
              value={localJobName}
              onChange={(e) => handleJobNameChange(e.target.value)}
              className={error ? "border-red-500" : ""}
              maxLength={255}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <p className="text-sm text-muted-foreground">{localJobName.length}/255 characters</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Holiday Thank You Campaign",
                "Q4 Donor Outreach",
                "New Donor Welcome Series",
                "Annual Report Follow-up",
                "Event Invitation Campaign",
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => handleJobNameChange(suggestion)}
                  className="text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={!localJobName.trim()}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
