import type { NextAuthConfig } from "next-auth";

type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      orgId: string | null;
      sessionToken: string;
    };
  }

  interface User {
    role: Role;
    orgId: string | null;
    sessionToken: string;
  }
}

/**
 * Edge-safe NextAuth config — no Prisma / Node.js imports.
 * Used by middleware.ts for JWT session reading.
 * The full auth.ts spreads this and adds Credentials provider.
 */
export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 60, // 30 minutes
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt({ token, user }: any) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.orgId = user.orgId;
        token.sessionToken = user.sessionToken;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session({ session, token }: any) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.orgId = token.orgId as string | null;
      session.user.sessionToken = token.sessionToken as string;
      return session;
    },
  },
  providers: [], // Populated in lib/auth.ts
} satisfies NextAuthConfig;
