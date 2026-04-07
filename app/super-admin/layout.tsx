"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

const navItems = [
  { href: "/super-admin", label: "Dashboard", icon: "📊" },
  { href: "/super-admin/orgs", label: "Organizations", icon: "🏢" },
  { href: "/super-admin/audit-log", label: "Audit Log", icon: "📋" },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white">
            Takaful <span className="text-red-500">Atlas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Super Admin</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/super-admin" && pathname.startsWith(item.href));
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
          <div className="text-sm text-slate-400 mb-2 truncate">
            {session?.user?.email}
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              signOut({ redirectTo: "/login" });
            }}
            className="w-full text-left text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
