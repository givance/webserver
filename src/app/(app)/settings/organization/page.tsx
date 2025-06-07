"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { OrganizationSettings } from "./OrganizationSettings";

export default function OrganizationPage() {
  return (
    <>
      <title>Organization - Settings</title>
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Organization Settings</h1>
        </div>

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
      </div>
    </>
  );
}
