import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = req.auth;

  // Not authenticated → redirect to login
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.role;

  // Landing page: redirect authenticated users to their dashboard
  if (pathname === "/") {
    return redirectByRole(req, role);
  }

  // Route protection by role
  if (pathname.startsWith("/super-admin")) {
    if (role !== "SUPER_ADMIN") {
      return redirectByRole(req, role);
    }
  } else if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      return redirectByRole(req, role);
    }
  } else if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/claim-form")
  ) {
    if (role !== "STAFF" && role !== "ADMIN") {
      return redirectByRole(req, role);
    }
  }

  return NextResponse.next();
});

function redirectByRole(req: NextRequest, role: string) {
  let target = "/login";
  switch (role) {
    case "SUPER_ADMIN":
      target = "/super-admin";
      break;
    case "ADMIN":
      target = "/admin";
      break;
    case "STAFF":
      target = "/dashboard";
      break;
  }
  return NextResponse.redirect(new URL(target, req.url));
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
