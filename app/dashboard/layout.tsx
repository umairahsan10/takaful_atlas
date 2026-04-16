"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/claim-form", label: "New Claim", icon: "📄" },
  { href: "/dashboard/bills", label: "Bills Validation", icon: "🧾" },
  { href: "/dashboard/my-bills", label: "My Bills", icon: "📑" },
  { href: "/dashboard/claims", label: "My Claims", icon: "📁" },
  { href: "/dashboard/rate-cards", label: "Rate Cards", icon: "💳" },
];

export default function DashboardLayout({
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
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden">
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open sidebar"
        className={`fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-all duration-300 ease-out ${
          sidebarOpen
            ? "opacity-0 -translate-x-2 pointer-events-none"
            : "opacity-100 translate-x-0"
        }`}
      >
        <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
        <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
        <span className="block w-5 h-0.5 bg-gray-700" />
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 z-40 bg-white border-r border-gray-200 shadow-sm flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-gray-200 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Takaful <span className="text-red-500">Atlas</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">Staff Dashboard</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              className="shrink-0 p-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors"
            >
              <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
              <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
              <span className="block w-5 h-0.5 bg-gray-700" />
            </button>
          </div>
        </div>

        {/* Scrollable nav area */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-red-50 text-red-600 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out — always stuck to bottom */}
        <div className="p-4 border-t border-gray-200 shrink-0">
          <div className="text-sm text-gray-500 mb-3 truncate">
            {session?.user?.email}
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              signOut({ redirectTo: "/login" });
            }}
            className="w-full flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            <span>Sign Out</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </aside>

      {/* Main content — shifts with sidebar */}
      <main
        className={`flex-1 overflow-auto transition-[margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[margin-left] ${
          sidebarOpen ? "ml-64" : "ml-0"
        }`}
      >
        <div className="p-8 pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}
