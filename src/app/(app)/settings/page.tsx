"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ChevronRight, Brain } from "lucide-react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { UserMemory } from "@/app/components/UserMemory";
import { useMemory } from "@/app/hooks/use-memory";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
  const { user } = useUser();
  const { memory, addMemoryItem, updateMemoryItem, deleteMemoryItem, isLoading } = useMemory();

  return (
    <>
      <title>Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <div className="grid gap-6">
          <Link href="/settings/organization">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5" />
                  <CardTitle>Organization</CardTitle>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Manage your organization&apos;s name, description, website, and other metadata
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardHeader className="flex flex-row items-center pb-2">
              <div className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <CardTitle>Memory Management</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Manage your personal memory items. These can be used to store important information or notes.
              </CardDescription>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <UserMemory
                  initialMemory={memory}
                  onAddMemory={addMemoryItem}
                  onUpdateMemory={updateMemoryItem}
                  onDeleteMemory={deleteMemoryItem}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
