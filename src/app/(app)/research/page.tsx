"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Search, Clock, Globe, BookOpen, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePersonResearch } from "@/app/hooks/use-person-research";

export default function ResearchPage() {
  const {
    researchTopic,
    setResearchTopic,
    result,
    isLoading,
    error,
    status,
    conductResearch,
    clearResults,
    canStartResearch,
  } = usePersonResearch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await conductResearch();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Person Research</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Conduct comprehensive research on individuals using our AI-powered multi-stage research pipeline. Get
            detailed insights with verified sources and citations.
          </p>
        </div>

        {/* Status Indicator */}
        {status && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {status.available ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium">Research Service Active</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-sm font-medium">Service Unavailable</span>
                  </>
                )}
                <Badge variant="outline" className="ml-auto">
                  {"maxLoops" in status ? status.maxLoops : 2} max research loops
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Research Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Research Request
            </CardTitle>
            <CardDescription>
              Enter details about the person you want to research. Be as specific as possible for better results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="researchTopic">Research Topic</Label>
                <Textarea
                  id="researchTopic"
                  placeholder="e.g., John Smith CEO of TechCorp background and professional experience"
                  value={researchTopic}
                  onChange={(e) => setResearchTopic(e.target.value)}
                  disabled={isLoading}
                  className="min-h-[100px]"
                  maxLength={500}
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Be specific about what you want to know about the person</span>
                  <span>{researchTopic.length}/500</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={!canStartResearch} className="flex-1">
                  {isLoading ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Start Research
                    </>
                  )}
                </Button>

                <Button type="button" variant="outline" onClick={clearResults} disabled={isLoading}>
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <Alert>
            <Clock className="h-4 w-4 animate-spin" />
            <AlertTitle>Research in Progress</AlertTitle>
            <AlertDescription>
              Our AI is conducting multi-stage research including query generation, web searches, gap analysis, and
              answer synthesis. This may take 30-60 seconds.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Research Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Research Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Research Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{result.metadata.totalLoops}</div>
                    <div className="text-sm text-muted-foreground">Research Loops</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{result.metadata.totalSources}</div>
                    <div className="text-sm text-muted-foreground">Sources Found</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{result.citations.length}</div>
                    <div className="text-sm text-muted-foreground">Citations</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{result.metadata.summaryCount}</div>
                    <div className="text-sm text-muted-foreground">Query Summaries</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Research Answer */}
            <Card>
              <CardHeader>
                <CardTitle>Research Results</CardTitle>
                <CardDescription>
                  Comprehensive answer synthesized from {result.metadata.totalSources} sources across{" "}
                  {result.metadata.totalLoops} research loops
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</div>
                </div>
              </CardContent>
            </Card>

            {/* Citations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Sources & Citations ({result.citations.length})
                </CardTitle>
                <CardDescription>All sources used in this research with direct links for verification</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.citations.map((citation, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <h4 className="font-medium text-sm">{citation.title}</h4>
                          <p className="text-sm text-muted-foreground">{citation.snippet}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {citation.relevance}
                            </Badge>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild className="shrink-0">
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Visit
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Research Process Details */}
            <Card>
              <CardHeader>
                <CardTitle>Research Process Details</CardTitle>
                <CardDescription>Detailed breakdown of each research loop and query</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.summaries.map((summary, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Query: {summary.query}</h4>
                        <Badge variant="outline">{summary.sourceCount} sources</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{summary.summary}</p>
                      <div className="text-xs text-muted-foreground">
                        {new Date(summary.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
