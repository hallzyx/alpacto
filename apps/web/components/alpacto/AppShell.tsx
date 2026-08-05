"use client";

import { AppSidebar } from "~~/components/alpacto/AppSidebar";
import { AyniProducerChat } from "~~/components/alpacto/AyniGuideChat";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~~/components/ui/sidebar";

export function AppShell({ children, showNav = true }: { children: React.ReactNode; showNav?: boolean }) {
  const { user } = useAuth();

  if (!showNav || !user) {
    return <div className="alpacto-product min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="alpacto-dashboard-panel p-0">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/60">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div aria-hidden className="h-4 w-px shrink-0 bg-border" />
              <span className="text-sm text-muted-foreground">Panel</span>
            </div>
          </header>
          <main className="flex-1 p-4 pt-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      {user.role === "producer" ? <AyniProducerChat /> : null}
    </div>
  );
}
