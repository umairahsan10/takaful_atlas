import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    async signOut(message) {
      // Clear the DB session token so admin sees "Offline" immediately
      const token = (message as { token?: { id?: string } }).token;
      const userId = token?.id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentSessionToken: null },
        }).catch(() => {/* ignore if user not found */});
      }
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        // Generate a unique session token for single-login enforcement
        const sessionToken = uuidv4();

        // Write to DB — invalidates any previous session
        await prisma.user.update({
          where: { id: user.id },
          data: {
            currentSessionToken: sessionToken,
            lastLogin: new Date(),
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          sessionToken,
        };
      },
    }),
  ],
});

/**
 * Validate that the JWT session token still matches the DB.
 * Returns false if the user logged in elsewhere (invalidating this session).
 */
export async function validateSessionToken(
  userId: string,
  sessionToken: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentSessionToken: true, isActive: true },
  });

  if (!user || !user.isActive) return false;
  return user.currentSessionToken === sessionToken;
}
