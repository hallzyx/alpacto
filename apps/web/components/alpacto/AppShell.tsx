"use client";

import Link from "next/link";
import { RoleNav } from "./RoleNav";

export function AppShell({ children, showNav = true }: { children: React.ReactNode; showNav?: boolean }) {
  return (
    <div className="alpacto-product min-h-screen flex flex-col">
      <header className="alp-header">
        <div className="alp-header__inner">
          <Link href="/" className="alp-brand">
            <span className="alp-brand__mark" aria-hidden />
            <span className="alp-brand__name">Alpacto</span>
          </Link>
          {showNav ? <RoleNav /> : null}
        </div>
      </header>
      <main className="alp-main flex-1 w-full">{children}</main>
      <footer className="alp-footer">
        <p>Un pacto justo por cada fibra.</p>
      </footer>
    </div>
  );
}
