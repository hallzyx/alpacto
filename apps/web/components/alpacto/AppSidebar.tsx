"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  ClipboardList,
  Factory,
  LogOut,
  LucideIcon,
  LayoutDashboard,
  Package,
  ShoppingCart,
  UserCircle,
  FilePlus2,
  CalendarRange,
  BookOpenText,
  MessageSquareWarning,
} from "lucide-react";

import { AlpactoMark } from "~~/components/alpacto/AlpactoMark";
import { useAuth } from "~~/components/alpacto/AuthProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "~~/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "~~/components/ui/avatar";
import type { UserRole } from "~~/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  items?: { href: string; label: string }[];
};

const ROLE_NAV: Record<UserRole, { label: string; items: NavItem[] }> = {
  producer: {
    label: "Productor",
    items: [
      { href: "/producer", label: "Panel", icon: LayoutDashboard },
      { href: "/producer/lots", label: "Mis lotes", icon: Package },
      { href: "/producer/guide", label: "Guía", icon: BookOpenText },
    ],
  },
  inspector: {
    label: "Inspector",
    items: [{ href: "/inspector", label: "Inspecciones", icon: ClipboardList }],
  },
  association: {
    label: "Asociación",
    items: [
      { href: "/association", label: "Panel", icon: Building2 },
      {
        href: "/association/campaigns",
        label: "Campañas",
        icon: CalendarRange,
        items: [
          { href: "/association/campaigns", label: "Listado" },
          { href: "/association/campaigns/new", label: "Nueva campaña" },
        ],
      },
      {
        href: "/association/lots/register",
        label: "Registrar lote",
        icon: FilePlus2,
      },
      {
        href: "/association/disputes",
        label: "Disputas",
        icon: MessageSquareWarning,
      },
    ],
  },
  buyer: {
    label: "Comprador",
    items: [
      { href: "/buyer", label: "Panel", icon: Building2 },
      {
        href: "/buyer/pricing",
        label: "Políticas",
        icon: BookOpenText,
        items: [
          { href: "/buyer/pricing", label: "Listado" },
          { href: "/buyer/pricing/new", label: "Nueva política" },
        ],
      },
      {
        href: "/buyer/campaigns",
        label: "Campañas",
        icon: Factory,
        items: [
          { href: "/buyer/campaigns", label: "Listado" },
          { href: "/buyer/campaigns/new", label: "Nueva campaña" },
        ],
      },
      {
        href: "/buyer/orders",
        label: "Órdenes",
        icon: ShoppingCart,
        items: [
          { href: "/buyer/orders", label: "Listado" },
          { href: "/buyer/orders/new", label: "Nueva orden" },
        ],
      },
    ],
  },
  admin: {
    label: "Admin",
    items: [{ href: "/admin", label: "On-chain", icon: Activity }],
  },
};

function roleBadge(role: UserRole) {
  const map: Record<UserRole, string> = {
    producer: "P",
    inspector: "I",
    association: "A",
    buyer: "C",
    admin: "AD",
  };
  return map[role] ?? role.slice(0, 1).toUpperCase();
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const nav = useMemo(() => (user ? ROLE_NAV[user.role] : null), [user]);
  const dashboardHome = nav?.items[0]?.href ?? "/";

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Alpacto">
              <Link href={dashboardHome} className="flex items-center gap-2">
                <AlpactoMark size="sm" />
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display text-xl leading-none font-semibold">Alpacto</span>
                  <span className="truncate text-xs text-muted-foreground">Fibra justa</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {nav ? (
          <SidebarGroup>
            <SidebarGroupLabel>{nav.label}</SidebarGroupLabel>
            <SidebarMenu>
              {nav.items.map(item => {
                const isDashboardRoot = ["/association", "/buyer", "/producer"].includes(item.href);
                const active = isDashboardRoot
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.items?.length ? (
                      <SidebarMenuSub>
                        {item.items.map(sub => {
                          const subActive = pathname === sub.href;
                          return (
                            <SidebarMenuSubItem key={sub.href}>
                              <SidebarMenuSubButton asChild isActive={subActive}>
                                <Link href={sub.href}>{sub.label}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        {user ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    tooltip={user.name}
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-sidebar-primary/15 text-xs font-semibold text-sidebar-primary">
                        {roleBadge(user.role)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                    <UserCircle className="ml-auto size-4 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Rol: <span className="font-medium text-foreground">{nav?.label ?? user.role}</span>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
