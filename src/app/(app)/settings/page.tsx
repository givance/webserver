"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Brain, GitGraph } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { UserMemory } from "@/app/components/UserMemory";
import { useMemory } from "@/app/hooks/use-memory";
import { useOrganization } from "@/app/hooks/use-organization";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationSettings } from "./organization/OrganizationSettings";
import { DonorJourneySettings } from "./donor-journey/DonorJourneySettings";

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
            <TabsTrigger value="memories" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>Memories</span>
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
        </Tabs>
      </div>
    </>
  );
}
