import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google sign-in (SPEC §9.5).
 *
 * The allowlist is the `Singer.email` column: signing in NEVER creates a
 * singer. An address a coordinator has not put against a singer gets viewer
 * access and nothing more — so adding somebody is a deliberate act in /admin,
 * not a side effect of them finding the URL.
 *
 * The role itself lives on `Singer.role`, so changing what somebody can do is
 * a database edit rather than a redeploy.
 *
 * Kept free of Prisma imports at module scope: this is used from middleware,
 * which runs on the edge runtime where Prisma cannot go. The lookup happens in
 * `lib/auth.ts` instead, on the server.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email as string;
      return session;
    },
  },
  pages: { signIn: "/signin" },
});

/** True when the Google credentials are configured. */
export const googleSignInConfigured =
  Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);
