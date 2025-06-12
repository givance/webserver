"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Calendar, Clock, BookOpen, Search, RefreshCw } from "lucide-react";
import { useDonorResearchData } from "@/app/hooks/use-donor-research";

interface DonorResearchDisplayProps {
  donorId: number;
  donorName: string;
}

export function DonorResearchDisplay({ donorId, donorName }: DonorResearchDisplayProps) {
  const {
    research,
    versions,
    isLoadingResearch,
    isLoadingVersions,
    isConductingResearch,
    researchError,
    versionsError,
    conductError,
    conductResearch,
    refetchResearch,
    hasResearch,
    versionCount,
  } = useDonorResearchData(donorId);

  // Loading state for initial research fetch
  if (isLoadingResearch) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (researchError) {
    return (
      <Alert>
        <AlertDescription>Error loading research: {researchError}</AlertDescription>
      </Alert>
    );
  }

  // No research available
  if (!hasResearch || !research) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Research Available</h3>
          <p className="text-muted-foreground mb-6">
            Research why {donorName} might want to donate to your organization.
          </p>
          <Button onClick={conductResearch} disabled={isConductingResearch} size="lg">
            {isConductingResearch ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Researching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Start Research
              </>
            )}
          </Button>
          {conductError && (
            <Alert className="mt-4 max-w-md mx-auto">
              <AlertDescription>{conductError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with metadata */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Research Insights</h3>
          <p className="text-sm text-muted-foreground">Understanding {donorName}&apos;s motivation to donate</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={conductResearch} disabled={isConductingResearch}>
            {isConductingResearch ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Researching...
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                New Research
              </>
            )}
          </Button>
          {conductError && (
            <Alert className="w-auto">
              <AlertDescription className="text-sm">{conductError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Research metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Research Date</p>
              <p className="text-xs text-muted-foreground">
                {new Date(research.metadata.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Sources</p>
              <p className="text-xs text-muted-foreground">{research.metadata.totalSources} sources</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Citations</p>
              <p className="text-xs text-muted-foreground">{research.citations.length} citations</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Versions</p>
              <p className="text-xs text-muted-foreground">{versionCount} total</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Research Topic */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Research Question</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">&ldquo;{research.metadata.researchTopic}&rdquo;</p>
        </CardContent>
      </Card>

      {/* Structured Data Summary */}
      {research.structuredData && (
        <Card>
          <CardHeader>
            <CardTitle>Key Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {research.structuredData.inferredAge && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Estimated Age</p>
                  <p className="text-lg font-semibold">{research.structuredData.inferredAge} years</p>
                </div>
              )}
              {research.structuredData.employer && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Employer</p>
                  <p className="text-lg font-semibold">{research.structuredData.employer}</p>
                </div>
              )}
              {research.structuredData.estimatedIncome && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">Estimated Income</p>
                  <p className="text-lg font-semibold">{research.structuredData.estimatedIncome}</p>
                </div>
              )}
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Donor Potential</p>
                <p className="text-lg font-semibold">
                  {research.structuredData.highPotentialDonor ? (
                    <span className="text-green-600">High Potential ✓</span>
                  ) : (
                    <span className="text-orange-600">Standard</span>
                  )}
                </p>
              </div>
            </div>

            {research.structuredData.highPotentialDonorRationale && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium mb-2 text-blue-900">Assessment Rationale</h4>
                <p className="text-sm text-blue-800">{research.structuredData.highPotentialDonorRationale}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Research Answer */}
      <Card>
        <CardHeader>
          <CardTitle>Research Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{research.answer}</div>
          </div>
        </CardContent>
      </Card>

      {/* Citations */}
      {research.citations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sources & Citations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {research.citations.map((citation, index) => (
                <div key={index} className="border-l-2 border-muted pl-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-tight mb-1">{citation.title}</h4>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{citation.snippet}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {citation.relevance}
                        </Badge>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          View Source
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research process details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Research Process</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Research Loops:</span>
              <span className="ml-2 text-muted-foreground">{research.metadata.totalLoops}</span>
            </div>
            <div>
              <span className="font-medium">Sources Analyzed:</span>
              <span className="ml-2 text-muted-foreground">{research.metadata.totalSources}</span>
            </div>
            <div>
              <span className="font-medium">Summary Count:</span>
              <span className="ml-2 text-muted-foreground">{research.metadata.summaryCount}</span>
            </div>
            <div>
              <span className="font-medium">Research Time:</span>
              <span className="ml-2 text-muted-foreground">
                {new Date(research.metadata.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
