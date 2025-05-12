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
  SidebarInset,
} from "@/components/ui/sidebar";
import { Home, Users, Heart, FolderGit2, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "react-hot-toast";

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
    <div className="flex flex-col items-center gap-2 pb-4">
      <UserButton afterSignOutUrl="/" />
      <span className="text-sm text-gray-700">
        {user?.firstName} {user?.lastName}
      </span>
    </div>
  );
}

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen w-full">
          <SidebarProvider>
            <Sidebar className="w-48">
              <SidebarHeader>
                <div className="flex flex-row items-center py-6 gap-2">
                  <Image src="/givance.png" alt="Givance Logo" width={40} height={40} className="" />
                  <span className="font-bold text-lg tracking-wide">Givance</span>
                </div>
              </SidebarHeader>
              <SidebarContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <Link href="/" className="w-full">
                      <SidebarMenuButton isActive>
                        <Home className="w-5 h-5" />
                        <span>Home</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link href="/staff" className="w-full">
                      <SidebarMenuButton>
                        <Users className="w-5 h-5" />
                        <span>Staff</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link href="/donors" className="w-full">
                      <SidebarMenuButton>
                        <Heart className="w-5 h-5" />
                        <span>Donors</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link href="/projects" className="w-full">
                      <SidebarMenuButton>
                        <FolderGit2 className="w-5 h-5" />
                        <span>Projects</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link href="/settings" className="w-full">
                      <SidebarMenuButton>
                        <Settings2 className="w-5 h-5" />
                        <span>Settings</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarContent>
              <SidebarFooter>
                <UserProfile />
              </SidebarFooter>
            </Sidebar>
            <SidebarInset className="flex-1 pl-6 pr-24">
              <TRPCProvider>{children}</TRPCProvider>
            </SidebarInset>
          </SidebarProvider>
          <Toaster position="top-right" />
        </div>
      </body>
    </html>
  );
}
