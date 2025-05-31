"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Brain, GitGraph, Mail, FileText } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { UserMemory } from "@/app/components/UserMemory";
import { useMemory } from "@/app/hooks/use-memory";
import { useOrganization } from "@/app/hooks/use-organization";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationSettings } from "./organization/OrganizationSettings";
import { DonorJourneySettings } from "./donor-journey/DonorJourneySettings";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/app/lib/trpc/client";
import React from "react";
import Link from "next/link";

function GmailConnect() {
  const gmailAuthMutation = trpc.gmail.getGmailAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error("Could not get Gmail authentication URL. Please try again.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initiate Gmail connection. Please try again.");
    },
  });

  const handleConnectGmail = () => {
    gmailAuthMutation.mutate();
  };

  const { data: gmailConnectionStatus, isLoading: isStatusLoading } = trpc.gmail.getGmailConnectionStatus.useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gmail Connection</CardTitle>
        <CardDescription>
          Connect your Gmail account to allow the application to compose and send emails on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isStatusLoading ? (
          <p>Loading Gmail connection status...</p>
        ) : gmailConnectionStatus?.isConnected && gmailConnectionStatus.email ? (
          <div className="flex flex-col items-start space-y-2">
            <p className="text-green-600 font-semibold">Gmail account connected.</p>
            <p>Email: {gmailConnectionStatus.email}</p>
          </div>
        ) : (
          <Button onClick={handleConnectGmail} disabled={gmailAuthMutation.isPending || isStatusLoading}>
            {gmailAuthMutation.isPending ? "Connecting..." : "Connect Gmail Account"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const {
    memory: personalMemory,
    addMemoryItem: addPersonalMemory,
    updateMemoryItem: updatePersonalMemory,
    deleteMemoryItem: deletePersonalMemory,
    isLoading: isPersonalMemoryLoading,
  } = useMemory();
  const {
    getOrganization,
    addMemoryItem: addOrgMemory,
    updateMemoryItem: updateOrgMemory,
    deleteMemoryItem: deleteOrgMemory,
    moveMemoryFromUser,
  } = useOrganization();
  const { data: organization, isLoading: isOrgLoading } = getOrganization();

  const isLoading = isPersonalMemoryLoading || isOrgLoading;

  return (
    <>
      <title>Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <Tabs defaultValue="organization" className="space-y-6">
          <TabsList>
            <TabsTrigger value="organization" className="flex items-center space-x-2">
              <Building2 className="h-4 w-4" />
              <span>Organization</span>
            </TabsTrigger>
            <TabsTrigger value="donor-journey" className="flex items-center space-x-2">
              <GitGraph className="h-4 w-4" />
              <span>Donor Journey</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Templates</span>
            </TabsTrigger>
            <TabsTrigger value="memories" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>Memories</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center space-x-2">
              <Mail className="h-4 w-4" />
              <span>Integrations</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization">
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>
                  Manage your organization&apos;s name, description, website, and other metadata
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrganizationSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="donor-journey">
            <DonorJourneySettings />
          </TabsContent>

          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle>Communication Templates</CardTitle>
                <CardDescription>
                  Manage reusable communication prompts for your organization. Templates can be used when creating
                  communication jobs to speed up the process.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Create and manage templates that can be used when composing communications to donors.
                  </p>
                  <Link href="/settings/templates">
                    <Button>
                      <FileText className="w-4 h-4 mr-2" />
                      Manage Templates
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="memories">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Memory</CardTitle>
                  <CardDescription>
                    Manage your personal memory items. These can be used to store important information or notes. You
                    can also move items to your organization&apos;s memory for team-wide access.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <UserMemory
                      initialMemory={personalMemory}
                      onAddMemory={addPersonalMemory}
                      onUpdateMemory={updatePersonalMemory}
                      onDeleteMemory={deletePersonalMemory}
                      onMoveToOrganization={moveMemoryFromUser}
                      showMoveToOrg={true}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Organization Memory</CardTitle>
                  <CardDescription>
                    Manage your organization&apos;s memory items. These can be used to store important information or
                    notes that all members can access.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <UserMemory
                      initialMemory={organization?.memory || []}
                      onAddMemory={addOrgMemory}
                      onUpdateMemory={updateOrgMemory}
                      onDeleteMemory={deleteOrgMemory}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="integrations">
            <GmailConnect />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
