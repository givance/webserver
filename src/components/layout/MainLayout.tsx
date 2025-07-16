'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import TRPCProvider from '@/app/lib/trpc/Provider';
import { UserButton, useUser, OrganizationSwitcher } from '@clerk/nextjs';
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Clock,
  Pin,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Toaster } from '@/components/ui/sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PageBreadcrumb } from '@/components/ui/page-breadcrumb';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Custom hook for responsive sidebar behavior
function useResponsiveSidebar() {
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
    };

    // Check initial screen size
    checkScreenSize();

    // Add event listener for window resize
    window.addEventListener('resize', checkScreenSize);

    // Cleanup
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return isLargeScreen;
}

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
  const { organization } = useOrganization();
  const [previousOrgId, setPreviousOrgId] = useState<string | null>(null);
  const { state } = useSidebar();

  // Listen for organization changes and force page refresh
  useEffect(() => {
    if (organization?.id) {
      // If we have a previous org ID and it's different from current, refresh the page
      if (previousOrgId && previousOrgId !== organization.id) {
        window.location.href = '/';
        return;
      }
      // Set the current org ID as the previous one for next comparison
      setPreviousOrgId(organization.id);
    }
  }, [organization?.id, previousOrgId]);

  return (
    <header
      className={cn(
        'flex items-center justify-between h-14 px-6 border-b bg-white fixed top-0 right-0 z-40 transition-all duration-200 ease-linear',
        // Adjust left margin based on sidebar state
        state === 'collapsed'
          ? 'left-0 sm:left-12' // 12 = 3rem (width of collapsed sidebar)
          : 'left-0 sm:left-64' // 64 = 16rem (width of expanded sidebar)
      )}
    >
      <div className="flex items-center gap-6 flex-1">
        <SidebarTrigger className="sm:flex hidden" />
        <PageBreadcrumb />
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search or type a command (⌘ + G)"
            className="pl-10 bg-gray-50 border-0"
          />
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
          afterSelectPersonalUrl="/"
          skipInvitationScreen={true}
          appearance={{
            elements: {
              rootBox: 'flex items-center gap-2',
            },
          }}
        />
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}

// Floating Navigation Component
function FloatingNavigation({
  pathname,
  isDonorOpen,
  setIsDonorOpen,
  isCampaignOpen,
  setIsCampaignOpen,
  isSettingsOpen,
  setIsSettingsOpen,
  onPin,
}: {
  pathname: string;
  isDonorOpen: boolean;
  setIsDonorOpen: (open: boolean) => void;
  isCampaignOpen: boolean;
  setIsCampaignOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  onPin: () => void;
}) {
  return (
    <div className="fixed left-12 top-0 h-screen w-64 bg-white border-r shadow-lg z-40 flex flex-col">
      {/* Header with Pin Button */}
      <div className="flex items-center justify-between h-14 px-4 border-b">
        <div className="flex items-center gap-2">
          <Image
            src="/givance.png"
            alt="Givance Logo"
            width={28}
            height={28}
            className="flex-shrink-0"
          />
          <span className="font-semibold text-lg">Givance</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onPin}
          className="h-8 w-8 hover:bg-gray-100"
          title="Pin sidebar"
        >
          <Pin className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
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
                  'w-4 h-4 flex-shrink-0 transition-transform duration-200',
                  isDonorOpen && 'rotate-90'
                )}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="ml-4 space-y-0">
              <SidebarMenuItem>
                <Link href="/donors" className="w-full min-w-0">
                  <SidebarMenuButton isActive={pathname.startsWith('/donors')} className="min-w-0">
                    <Heart className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Donors</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/lists" className="w-full min-w-0">
                  <SidebarMenuButton isActive={pathname.startsWith('/lists')} className="min-w-0">
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
                  'w-4 h-4 flex-shrink-0 transition-transform duration-200',
                  isCampaignOpen && 'rotate-90'
                )}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="ml-4 space-y-0">
              <SidebarMenuItem>
                <Link href="/campaign" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/campaign')}
                    className="min-w-0"
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Create Campaign</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/existing-campaigns" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/existing-campaigns')}
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
                  'w-4 h-4 flex-shrink-0 transition-transform duration-200',
                  isSettingsOpen && 'rotate-90'
                )}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="ml-4 space-y-0">
              <SidebarMenuItem>
                <Link href="/staff" className="w-full min-w-0">
                  <SidebarMenuButton isActive={pathname.startsWith('/staff')} className="min-w-0">
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Staff</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/projects" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/projects')}
                    className="min-w-0"
                  >
                    <FolderGit2 className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Projects</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/settings/organization" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/settings/organization')}
                    className="min-w-0"
                  >
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Organization</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/settings/email-schedule" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/settings/email-schedule')}
                    className="min-w-0"
                  >
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Email Schedule</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/settings/templates" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/settings/templates')}
                    className="min-w-0"
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Templates</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              {/* <SidebarMenuItem>
                <Link href="/settings/memories" className="w-full min-w-0">
                  <SidebarMenuButton
                    isActive={pathname.startsWith('/settings/memories')}
                    className="min-w-0"
                  >
                    <Brain className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left truncate">Memories</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem> */}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

// Separate component to use useSidebar hook and manage collapsible state
function SidebarContentWrapper({
  children,
  pathname,
  isDonorOpen,
  setIsDonorOpen,
  isCampaignOpen,
  setIsCampaignOpen,
  isSettingsOpen,
  setIsSettingsOpen,
}: {
  children: React.ReactNode;
  pathname: string;
  isDonorOpen: boolean;
  setIsDonorOpen: (open: boolean) => void;
  isCampaignOpen: boolean;
  setIsCampaignOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}) {
  const { state, setOpen } = useSidebar();
  const [showFloatingNav, setShowFloatingNav] = useState(false);

  // When collapsed, always show all sections as expanded
  const effectiveDonorOpen = state === 'collapsed' ? true : isDonorOpen;
  const effectiveCampaignOpen = state === 'collapsed' ? true : isCampaignOpen;
  const effectiveSettingsOpen = state === 'collapsed' ? true : isSettingsOpen;

  const handlePin = () => {
    setOpen(true);
    setShowFloatingNav(false);
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => state === 'collapsed' && setShowFloatingNav(true)}
        onMouseLeave={() => setShowFloatingNav(false)}
      >
        <Sidebar
          collapsible="icon"
          className="border-r bg-white flex-col fixed left-0 top-0 h-screen z-50 overflow-hidden hidden sm:flex"
        >
          <SidebarHeader className="flex-none">
            <Link
              href="/"
              className="flex items-center h-14 px-4 border-b gap-2 hover:bg-gray-50 transition-colors min-w-0"
            >
              <Image
                src="/givance.png"
                alt="Givance Logo"
                width={28}
                height={28}
                className="flex-shrink-0"
              />
              <span className="font-semibold text-lg truncate group-data-[collapsible=icon]:hidden">
                Givance
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-3 py-2 space-y-0 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-1">
              {/* Donor Management - Collapsible */}
              <Collapsible
                open={effectiveDonorOpen}
                onOpenChange={state === 'collapsed' ? undefined : setIsDonorOpen}
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="w-full justify-between min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Heart className="w-4 h-4 flex-shrink-0" />
                      <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                        Donor
                      </span>
                    </div>
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 flex-shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden',
                        effectiveDonorOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="group-data-[collapsible=icon]:space-y-1">
                  <SidebarMenu className="ml-4 space-y-0 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:space-y-1">
                    <SidebarMenuItem>
                      <Link href="/donors" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/donors')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Heart className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Donors
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/lists" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/lists')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <List className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Donor Lists
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>

              {/* Campaign - Collapsible */}
              <Collapsible
                open={effectiveCampaignOpen}
                onOpenChange={state === 'collapsed' ? undefined : setIsCampaignOpen}
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="w-full justify-between min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                      <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                        Campaign
                      </span>
                    </div>
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 flex-shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden',
                        effectiveCampaignOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="group-data-[collapsible=icon]:space-y-1">
                  <SidebarMenu className="ml-4 space-y-0 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:space-y-1">
                    <SidebarMenuItem>
                      <Link href="/campaign" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/campaign')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <MessageSquare className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Create Campaign
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/existing-campaigns" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/existing-campaigns')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Briefcase className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Existing Campaigns
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>

              {/* Settings - Collapsible */}
              <Collapsible
                open={effectiveSettingsOpen}
                onOpenChange={state === 'collapsed' ? undefined : setIsSettingsOpen}
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="w-full justify-between min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Settings2 className="w-4 h-4 flex-shrink-0" />
                      <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                        Settings
                      </span>
                    </div>
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 flex-shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden',
                        effectiveSettingsOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="group-data-[collapsible=icon]:space-y-1">
                  <SidebarMenu className="ml-4 space-y-0 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:space-y-1">
                    <SidebarMenuItem>
                      <Link href="/staff" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/staff')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Users className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Staff
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/projects" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/projects')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <FolderGit2 className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Projects
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/settings/organization" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/settings/organization')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Building2 className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Organization
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/settings/email-schedule" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/settings/email-schedule')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Clock className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Email Schedule
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/settings/templates" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/settings/templates')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Templates
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    {/* <SidebarMenuItem>
                      <Link href="/settings/memories" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/settings/memories')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Brain className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Memories
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/settings/integrations" className="w-full min-w-0">
                        <SidebarMenuButton
                          isActive={pathname.startsWith('/settings/integrations')}
                          className="min-w-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                        >
                          <Mail className="w-4 h-4 flex-shrink-0" />
                          <span className="text-left truncate group-data-[collapsible=icon]:hidden">
                            Integrations
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem> */}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </SidebarContent>
          <SidebarFooter className="flex-none" />
        </Sidebar>

        {/* Floating Navigation Popup */}
        {showFloatingNav && state === 'collapsed' && (
          <FloatingNavigation
            pathname={pathname}
            isDonorOpen={isDonorOpen}
            setIsDonorOpen={setIsDonorOpen}
            isCampaignOpen={isCampaignOpen}
            setIsCampaignOpen={setIsCampaignOpen}
            isSettingsOpen={isSettingsOpen}
            setIsSettingsOpen={setIsSettingsOpen}
            onPin={handlePin}
          />
        )}
      </div>

      <LayoutContent>
        <Header />
        <main className="flex-1 pt-14 px-4 sm:px-6 md:px-8">
          <TRPCProvider>{children}</TRPCProvider>
        </main>
      </LayoutContent>
    </>
  );
}

// Separate component to use useSidebar hook
function LayoutContent({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();

  return (
    <div
      className={cn(
        'flex-1 flex flex-col transition-all duration-200 ease-linear',
        // Adjust margin based on sidebar state
        state === 'collapsed'
          ? 'sm:ml-12' // 12 = 3rem (width of collapsed sidebar)
          : 'sm:ml-64' // 64 = 16rem (width of expanded sidebar)
      )}
    >
      {children}
    </div>
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
      <body className={cn(geistSans.variable, geistMono.variable, 'antialiased bg-gray-50')}>
        <div className="min-h-screen w-full">
          <ResponsiveSidebarProvider>
            <SidebarContentWrapper
              pathname={pathname}
              isDonorOpen={isDonorOpen}
              setIsDonorOpen={setIsDonorOpen}
              isCampaignOpen={isCampaignOpen}
              setIsCampaignOpen={setIsCampaignOpen}
              isSettingsOpen={isSettingsOpen}
              setIsSettingsOpen={setIsSettingsOpen}
            >
              {children}
            </SidebarContentWrapper>
          </ResponsiveSidebarProvider>
          <Toaster />
        </div>
      </body>
    </html>
  );
}

// Responsive Sidebar Provider wrapper
function ResponsiveSidebarProvider({ children }: { children: React.ReactNode }) {
  const isLargeScreen = useResponsiveSidebar();
  const [manuallySet, setManuallySet] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Automatically adjust sidebar based on screen size, unless manually set
  useEffect(() => {
    if (!manuallySet) {
      setSidebarOpen(isLargeScreen);
    }
  }, [isLargeScreen, manuallySet]);

  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    setManuallySet(true);

    // Reset manual flag after a delay to allow auto-responsiveness again
    setTimeout(() => setManuallySet(false), 5000);
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange} defaultOpen={isLargeScreen}>
      {children}
    </SidebarProvider>
  );
}
