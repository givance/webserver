"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
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

          {/* Additional settings sections can be added here */}
        </div>
      </div>
    </>
  );
}
