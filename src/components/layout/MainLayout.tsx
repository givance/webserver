"use client";

import { Geist, Geist_Mono } from "next/font/google";
import TRPCProvider from "@/app/lib/trpc/Provider";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Home, Users, Heart, FolderGit2, Settings2, MessageSquare, Search, Bell } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageBreadcrumb } from "@/components/ui/page-breadcrumb";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function CommunicateMenuItem() {
  return (
    <SidebarMenuItem>
      <Link href="/communicate" className="w-full">
        <SidebarMenuButton>
          <MessageSquare className="w-4 h-4" />
          <span>Communicate</span>
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  );
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
  return (
    <html lang="en">
      <body className={cn(geistSans.variable, geistMono.variable, "antialiased bg-gray-50")}>
        <div className="min-h-screen w-full flex">
          <SidebarProvider>
            <Sidebar className="w-52 border-r bg-white flex flex-col">
              <SidebarHeader className="flex-none">
                <div className="flex items-center h-14 px-4 border-b gap-2">
                  <Image src="/givance.png" alt="Givance Logo" width={28} height={28} className="" />
                  <span className="font-semibold text-lg">Givance</span>
                </div>
              </SidebarHeader>
              <SidebarContent className="flex-1">
                <div className="px-2">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <Link href="/" className="w-full">
                        <SidebarMenuButton isActive>
                          <Home className="w-4 h-4" />
                          <span>Home</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/staff" className="w-full">
                        <SidebarMenuButton>
                          <Users className="w-4 h-4" />
                          <span>Staff</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/donors" className="w-full">
                        <SidebarMenuButton>
                          <Heart className="w-4 h-4" />
                          <span>Donors</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <Link href="/projects" className="w-full">
                        <SidebarMenuButton>
                          <FolderGit2 className="w-4 h-4" />
                          <span>Projects</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                    <CommunicateMenuItem />
                    <SidebarMenuItem>
                      <Link href="/settings" className="w-full">
                        <SidebarMenuButton>
                          <Settings2 className="w-4 h-4" />
                          <span>Settings</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </div>
              </SidebarContent>
              <SidebarFooter className="flex-none" />
            </Sidebar>
            <div className="flex-1 flex flex-col">
              <Header />
              <main className="flex-1 p-6">
                <TRPCProvider>{children}</TRPCProvider>
              </main>
            </div>
          </SidebarProvider>
          <Toaster position="top-right" />
        </div>
      </body>
    </html>
  );
}
