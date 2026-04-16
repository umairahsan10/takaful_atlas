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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Hamburger toggle — always visible */}
      <button
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Toggle sidebar"
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors"
      >
        <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
        <span className="block w-5 h-0.5 bg-gray-700 mb-1" />
        <span className="block w-5 h-0.5 bg-gray-700" />
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        <div className="p-6 border-b border-gray-200 shrink-0">
          <h1 className="text-xl font-bold text-gray-900">
            Takaful <span className="text-red-500">Atlas</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">Staff Dashboard</p>
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
          <div className="text-sm text-gray-500 mb-2 truncate">
            {session?.user?.email}
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              signOut({ redirectTo: "/login" });
            }}
            className="w-full text-left text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content — shifts with sidebar */}
      <main
        className={`flex-1 overflow-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-0"
        }`}
      >
        <div className="p-8 pt-16">{children}</div>
      </main>
    </div>
  );
}
