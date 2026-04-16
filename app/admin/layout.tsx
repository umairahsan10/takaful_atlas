"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/rate-cards", label: "Rate Cards", icon: "💳" },
  { href: "/admin/quota", label: "Quota", icon: "📈" },
  { href: "/admin/analytics", label: "Analytics", icon: "📉" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "📋" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex overflow-x-hidden">
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar"
        className={`fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-sm hover:bg-slate-800 transition-all duration-300 ease-out ${
          sidebarOpen
            ? "opacity-0 -translate-x-2 pointer-events-none"
            : "opacity-100 translate-x-0"
        }`}
      >
        <span className="block w-5 h-0.5 bg-slate-200 mb-1" />
        <span className="block w-5 h-0.5 bg-slate-200 mb-1" />
        <span className="block w-5 h-0.5 bg-slate-200" />
      </button>

      <aside
        className={`fixed top-0 left-0 h-full w-64 z-40 bg-slate-900 border-r border-slate-800 shadow-sm flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">
                Takaful <span className="text-red-500">Atlas</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1">Admin Panel</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              className="shrink-0 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-sm hover:bg-slate-800 transition-colors"
            >
              <span className="block w-5 h-0.5 bg-slate-200 mb-1" />
              <span className="block w-5 h-0.5 bg-slate-200 mb-1" />
              <span className="block w-5 h-0.5 bg-slate-200" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-red-500/10 text-red-400"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-sm text-slate-400 mb-3 truncate">
            {session?.user?.email}
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              signOut({ redirectTo: "/login" });
            }}
            className="w-full flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <span>Sign Out</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </aside>

      <main
        className={`flex-1 overflow-auto transition-[margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[margin-left] ${
          sidebarOpen ? "ml-64" : "ml-0"
        }`}
      >
        <div className="p-8 pt-10">{children}</div>
      </main>
    </div>
  );
}
