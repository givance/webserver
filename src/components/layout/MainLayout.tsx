"use client";

import { Geist, Geist_Mono } from "next/font/google";
import TRPCProvider from "@/app/lib/trpc/Provider";
import { UserButton, useUser, OrganizationSwitcher } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Home,
  Users,
  Heart,
  FolderGit2,
  Settings2,
  MessageSquare,
  Search,
  Bell,
  Briefcase,
  List,
  ChevronRight,
  Building2,
  GitGraph,
  FileText,
  Brain,
  Mail,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageBreadcrumb } from "@/components/ui/page-breadcrumb";
import { useState } from "react";
import { usePathname } from "next/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function UserProfile() {
  const { user } = useUser();

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t">
      <UserButton afterSignOutUrl="/" />
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {user?.firstName} {user?.lastName}
        </span>
        <span className="text-xs text-gray-500">{user?.emailAddresses[0]?.emailAddress}</span>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between h-14 px-6 border-b bg-white">
      <div className="flex items-center gap-6 flex-1">
        <PageBreadcrumb />
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="Search or type a command (⌘ + G)" className="pl-10 bg-gray-50 border-0" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-gray-100 rounded-lg">
          <Bell className="w-5 h-5 text-gray-600" />
        </button>
        <OrganizationSwitcher
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          appearance={{
            elements: {
              rootBox: "flex items-center gap-2",
            },
          }}
        />
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [isDonorOpen, setIsDonorOpen] = useState(true);
  const [isCampaignOpen, setIsCampaignOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  return (
    <html lang="en">
      <body className={cn(geistSans.variable, geistMono.variable, "antialiased bg-gray-50")}>
        <div className="min-h-screen w-full">
          <SidebarProvider>
            <Sidebar className="w-64 border-r bg-white flex flex-col fixed left-0 top-0 h-screen z-50 overflow-hidden">
              <SidebarHeader className="flex-none">
                <Link
                  href="/"
                  className="flex items-center h-14 px-4 border-b gap-2 hover:bg-gray-50 transition-colors min-w-0"
                >
                  <Image src="/givance.png" alt="Givance Logo" width={28} height={28} className="flex-shrink-0" />
                  <span className="font-semibold text-lg truncate">Givance</span>
                </Link>
              </SidebarHeader>
              <SidebarContent className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="px-3 py-2 space-y-0">
                  {/* Donor Management - Collapsible */}
                  <Collapsible open={isDonorOpen} onOpenChange={setIsDonorOpen}>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full justify-between min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Heart className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate">Donor</span>
                        </div>
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-transform duration-200",
                            isDonorOpen && "rotate-90"
                          )}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenu className="ml-4 space-y-0">
                        <SidebarMenuItem>
                          <Link href="/donors" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/donors")} className="min-w-0">
                              <Heart className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Donors</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/lists" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/lists")} className="min-w-0">
                              <List className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Donor Lists</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Campaign - Collapsible */}
                  <Collapsible open={isCampaignOpen} onOpenChange={setIsCampaignOpen}>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full justify-between min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <MessageSquare className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate">Campaign</span>
                        </div>
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-transform duration-200",
                            isCampaignOpen && "rotate-90"
                          )}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenu className="ml-4 space-y-0">
                        <SidebarMenuItem>
                          <Link href="/campaign" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/campaign")} className="min-w-0">
                              <MessageSquare className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Create Campaign</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/existing-campaigns" className="w-full min-w-0">
                            <SidebarMenuButton
                              isActive={pathname.startsWith("/existing-campaigns")}
                              className="min-w-0"
                            >
                              <Briefcase className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Existing Campaigns</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Settings - Collapsible */}
                  <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full justify-between min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Settings2 className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate">Settings</span>
                        </div>
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-transform duration-200",
                            isSettingsOpen && "rotate-90"
                          )}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenu className="ml-4 space-y-0">
                        <SidebarMenuItem>
                          <Link href="/staff" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/staff")} className="min-w-0">
                              <Users className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Staff</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/projects" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/projects")} className="min-w-0">
                              <FolderGit2 className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Projects</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/settings/organization" className="w-full min-w-0">
                            <SidebarMenuButton
                              isActive={pathname.startsWith("/settings/organization")}
                              className="min-w-0"
                            >
                              <Building2 className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Organization</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/settings/donor-journey" className="w-full min-w-0">
                            <SidebarMenuButton
                              isActive={pathname.startsWith("/settings/donor-journey")}
                              className="min-w-0"
                            >
                              <GitGraph className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Donor Journey</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/settings/templates" className="w-full min-w-0">
                            <SidebarMenuButton
                              isActive={pathname.startsWith("/settings/templates")}
                              className="min-w-0"
                            >
                              <FileText className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Templates</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/settings/memories" className="w-full min-w-0">
                            <SidebarMenuButton isActive={pathname.startsWith("/settings/memories")} className="min-w-0">
                              <Brain className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Memories</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <Link href="/settings/integrations" className="w-full min-w-0">
                            <SidebarMenuButton
                              isActive={pathname.startsWith("/settings/integrations")}
                              className="min-w-0"
                            >
                              <Mail className="w-4 h-4 flex-shrink-0" />
                              <span className="text-left truncate">Integrations</span>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </SidebarContent>
              <SidebarFooter className="flex-none" />
            </Sidebar>
            <div className="flex-1 flex flex-col ml-64">
              <Header />
              <main className="flex-1">
                <TRPCProvider>{children}</TRPCProvider>
              </main>
            </div>
          </SidebarProvider>
          <Toaster />
        </div>
      </body>
    </html>
  );
}
