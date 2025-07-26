'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  X,
  Users,
  DollarSign,
  AlertCircle,
  CheckCircle,
  MinusCircle,
  PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import type { CrmSyncResult } from '@/app/lib/services/crm/base/types';

interface SyncResultsDisplayProps {
  results: CrmSyncResult;
  onClose: () => void;
  providerName: string;
}

export function SyncResultsDisplay({ results, onClose, providerName }: SyncResultsDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const renderDonorSection = () => {
    const { donors } = results;
    const hasData = donors.total > 0;

    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Donors</CardTitle>
            </div>
            <Badge variant="secondary">{donors.total} total</Badge>
          </div>
          {hasData && (
            <CardDescription className="mt-2">
              <div className="flex flex-wrap gap-3 text-sm">
                {donors.created > 0 && (
                  <span className="flex items-center gap-1">
                    <PlusCircle className="h-3 w-3 text-green-600" />
                    {donors.created} new
                  </span>
                )}
                {donors.updated > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    {donors.updated} updated
                  </span>
                )}
                {donors.unchanged > 0 && (
                  <span className="flex items-center gap-1">
                    <MinusCircle className="h-3 w-3 text-gray-500" />
                    {donors.unchanged} unchanged
                  </span>
                )}
                {donors.failed > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-red-600" />
                    {donors.failed} failed
                  </span>
                )}
              </div>
            </CardDescription>
          )}
        </CardHeader>

        {hasData && (
          <CardContent className="space-y-3">
            {/* New Donors */}
            {donors.created > 0 && (
              <Collapsible>
                <CollapsibleTrigger
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary cursor-pointer w-full"
                  onClick={() => toggleSection('donors-created')}
                >
                  {expandedSections.includes('donors-created') ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  View new donors ({donors.created})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] w-full rounded-md border p-3 mt-2">
                    <div className="space-y-2">
                      {donors.createdDonors?.map((donor, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium">{donor.displayName}</span>
                          <span className="text-muted-foreground ml-2">({donor.externalId})</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Updated Donors */}
            {donors.updated > 0 && (
              <Collapsible>
                <CollapsibleTrigger
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary cursor-pointer w-full"
                  onClick={() => toggleSection('donors-updated')}
                >
                  {expandedSections.includes('donors-updated') ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  View updated donors ({donors.updated})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] w-full rounded-md border p-3 mt-2">
                    <div className="space-y-2">
                      {donors.updatedDonors?.map((donor, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium">{donor.displayName}</span>
                          <span className="text-muted-foreground ml-2">({donor.externalId})</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Failed Donors */}
            {donors.failed > 0 && (
              <Collapsible>
                <CollapsibleTrigger
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary cursor-pointer w-full text-red-600"
                  onClick={() => toggleSection('donors-failed')}
                >
                  {expandedSections.includes('donors-failed') ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  View failed donors ({donors.failed})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] w-full rounded-md border border-red-200 p-3 mt-2">
                    <div className="space-y-2">
                      {donors.errors.map((error, idx) => (
                        <div key={idx} className="text-sm text-red-600">
                          <div className="font-medium">{error.externalId}</div>
                          <div className="text-xs text-red-500">{error.error}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  const renderDonationSection = () => {
    const { donations } = results;
    const hasData = donations.total > 0;

    return (
      <Card className="border-l-4 border-l-green-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg">Donations</CardTitle>
            </div>
            <Badge variant="secondary">{donations.total} total</Badge>
          </div>
          {hasData && (
            <CardDescription className="mt-2">
              <div className="flex flex-wrap gap-3 text-sm">
                {donations.created > 0 && (
                  <span className="flex items-center gap-1">
                    <PlusCircle className="h-3 w-3 text-green-600" />
                    {donations.created} new
                  </span>
                )}
                {donations.updated > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    {donations.updated} updated
                  </span>
                )}
                {donations.unchanged > 0 && (
                  <span className="flex items-center gap-1">
                    <MinusCircle className="h-3 w-3 text-gray-500" />
                    {donations.unchanged} unchanged
                  </span>
                )}
                {donations.failed > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-red-600" />
                    {donations.failed} failed
                  </span>
                )}
              </div>
            </CardDescription>
          )}
        </CardHeader>

        {hasData && (
          <CardContent className="space-y-3">
            {/* Similar structure for donations as donors */}
            {donations.failed > 0 && (
              <Collapsible>
                <CollapsibleTrigger
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary cursor-pointer w-full text-red-600"
                  onClick={() => toggleSection('donations-failed')}
                >
                  {expandedSections.includes('donations-failed') ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  View failed donations ({donations.failed})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] w-full rounded-md border border-red-200 p-3 mt-2">
                    <div className="space-y-2">
                      {donations.errors.map((error, idx) => (
                        <div key={idx} className="text-sm text-red-600">
                          <div className="font-medium">{error.externalId}</div>
                          <div className="text-xs text-red-500">{error.error}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="fixed inset-x-0 top-4 mx-auto max-w-4xl px-4 z-50">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{providerName} Sync Results</CardTitle>
              <CardDescription>Completed in {formatTime(results.totalTime)}</CardDescription>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderDonorSection()}
          {renderDonationSection()}
        </CardContent>
      </Card>
    </div>
  );
}
