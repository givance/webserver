'use client';

import { trpc } from '@/app/lib/trpc/client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, DollarSign, Hash, HelpCircle } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';

interface DonorTooltipProps {
  donorId: number;
  donorName: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

interface DonorDonationData {
  donations: any[];
  totalCount: number;
  totalAmount: number;
  notes: any[];
}

export function DonorTooltip({
  donorId,
  donorName,
  children,
  side = 'right',
  align = 'start',
}: DonorTooltipProps) {
  const [loadingDonations, setLoadingDonations] = useState(false);
  const [donorDonations, setDonorDonations] = useState<DonorDonationData | null>(null);
  const loadingRef = useRef(false);
  const donorDonationsRef = useRef<DonorDonationData | null>(null);

  const utils = trpc.useUtils();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatDate = (date: string | Date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const loadDonorDonations = useCallback(
    async (donorId: number) => {
      if (loadingRef.current || donorDonationsRef.current) return;

      setLoadingDonations(true);
      loadingRef.current = true;

      try {
        // Get accurate donation statistics
        const statsResult = await utils.donations.getDonorStats.fetch({ donorId });

        // Get recent donations for display
        const donationsResult = await utils.donations.list.fetch({
          donorId,
          limit: 20,
          orderBy: 'date',
          orderDirection: 'desc',
          includeProject: true,
        });

        if (statsResult && donationsResult) {
          const data: DonorDonationData = {
            donations: donationsResult.donations,
            totalCount: donationsResult.totalCount,
            totalAmount: statsResult.totalDonated,
            notes: statsResult.notes || [],
          };

          setDonorDonations(data);
          donorDonationsRef.current = data;
        }
      } catch (error) {
        console.error('Error loading donor donations:', error);
      } finally {
        setLoadingDonations(false);
        loadingRef.current = false;
      }
    },
    [utils.donations.list, utils.donations.getDonorStats]
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild onMouseEnter={() => loadDonorDonations(donorId)}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-sm p-0 bg-background border">
        <div className="p-4 space-y-3">
          <div className="font-semibold text-sm border-b pb-2">{donorName}</div>

          {loadingDonations ? (
            <div className="text-sm text-muted-foreground">Loading donations...</div>
          ) : donorDonations ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-600 dark:text-gray-400">Total Donations</div>
                  <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                    <Hash className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                    {donorDonations.totalCount || 0}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600 dark:text-gray-400">Total Amount</div>
                  <div className="font-semibold flex items-center gap-1 text-gray-900 dark:text-gray-100">
                    <DollarSign className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                    {formatCurrency(donorDonations.totalAmount || 0)}
                  </div>
                </div>
              </div>

              {donorDonations.donations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Recent Donations
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {donorDonations.donations.slice(0, 20).map((donation: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                          <span className="text-gray-900 dark:text-gray-100">
                            {formatDate(donation.date)}
                          </span>
                          {donation.project && (
                            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                              • {donation.project.name}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(donation.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Notes</div>
                {donorDonations.notes && donorDonations.notes.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {donorDonations.notes.map((note: any, idx: number) => (
                      <div
                        key={idx}
                        className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-2 border-blue-200 dark:border-blue-800"
                      >
                        <div className="text-gray-900 dark:text-gray-100 mb-1">{note.content}</div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          {new Date(note.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    No notes for this donor
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">No donations found</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
