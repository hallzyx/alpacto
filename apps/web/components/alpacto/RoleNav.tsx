"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "~~/lib/types";

type NavItem = { href: string; label: string };

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  producer: [{ href: "/producer", label: "Mis lotes" }],
  inspector: [{ href: "/inspector", label: "Inspecciones" }],
  association: [{ href: "/association", label: "Asociación" }],
  buyer: [
    { href: "/buyer/campaigns", label: "Campañas" },
    { href: "/buyer/orders", label: "Órdenes" },
  ],
  admin: [{ href: "/admin", label: "Admin" }],
};

export function RoleNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = NAV_BY_ROLE[user.role] ?? [];

  return (
    <nav className="alp-role-nav" aria-label="Navegación por rol">
      <div className="alp-role-nav__links">
        {items.map(item => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`alp-nav-link${active ? " alp-nav-link--active" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="alp-role-nav__meta">
        <span className="alp-role-nav__name">{user.name}</span>
        <button type="button" className="alp-link-btn" onClick={logout}>
          Salir
        </button>
      </div>
    </nav>
  );
}
