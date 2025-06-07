"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { UserMemory } from "@/app/components/UserMemory";
import { useMemory } from "@/app/hooks/use-memory";
import { useOrganization } from "@/app/hooks/use-organization";
import { Skeleton } from "@/components/ui/skeleton";

export default function MemoriesPage() {
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
      <title>Memories - Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Brain className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Memories</h1>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Memory</CardTitle>
              <CardDescription>
                Manage your personal memory items. These can be used to store important information or notes. You can
                also move items to your organization&apos;s memory for team-wide access.
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
                Manage your organization&apos;s memory items. These can be used to store important information or notes
                that all members can access.
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
      </div>
    </>
  );
}
