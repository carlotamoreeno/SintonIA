import type { NextAuthConfig, Session } from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { authEnv } from "@/lib/auth/env";
import { buildAppUserId } from "@/lib/auth/identity";
import { isAppRole, resolveUserRole } from "@/lib/auth/roles";

type JwtClaimsInput = {
  token: JWT;
  account?: {
    provider?: string | null;
    providerAccountId?: string | null;
  } | null;
  profile?: {
    sub?: string | null;
  } | null;
  user?: {
    email?: string | null;
  } | null;
};

function resolveTokenProvider(token: JWT, account?: JwtClaimsInput["account"]) {
  if (account?.provider) {
    return account.provider;
  }

  return typeof token.provider === "string" ? token.provider : "google";
}

function resolveTokenSubject(token: JWT, input: JwtClaimsInput) {
  if (input.account?.providerAccountId) {
    return input.account.providerAccountId;
  }

  if (input.profile?.sub) {
    return input.profile.sub;
  }

  if (typeof token.authSubject === "string") {
    return token.authSubject;
  }

  return typeof token.sub === "string" ? token.sub : null;
}

function resolveTokenEmail(token: JWT, user?: JwtClaimsInput["user"]) {
  if (typeof user?.email === "string" && user.email.length > 0) {
    return user.email;
  }

  return typeof token.email === "string" ? token.email : null;
}

export async function applyJwtSessionClaims(input: JwtClaimsInput) {
  const { token } = input;
  const provider = resolveTokenProvider(token, input.account);
  const authSubject = resolveTokenSubject(token, input);
  const email = resolveTokenEmail(token, input.user);

  token.provider = provider;

  if (authSubject) {
    token.authSubject = authSubject;
    token.appUserId = buildAppUserId(provider, authSubject);
  }

  if (email) {
    token.email = email;
  }

  token.role = resolveUserRole(email, authEnv);

  return token;
}

function resolveSessionUserId(token: JWT) {
  if (typeof token.appUserId === "string") {
    return token.appUserId;
  }

  const provider =
    typeof token.provider === "string" ? token.provider : "google";
  const authSubject =
    typeof token.authSubject === "string"
      ? token.authSubject
      : typeof token.sub === "string"
        ? token.sub
        : null;

  return authSubject ? buildAppUserId(provider, authSubject) : "";
}

function resolveSessionUserRole(token: JWT) {
  if (isAppRole(token.role)) {
    return token.role;
  }

  return resolveUserRole(
    typeof token.email === "string" ? token.email : null,
    authEnv,
  );
}

export async function applySessionUserClaims({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}) {
  session.user = {
    ...session.user,
    id: resolveSessionUserId(token),
    role: resolveSessionUserRole(token),
    email:
      session.user?.email ??
      (typeof token.email === "string" ? token.email : null),
    name:
      session.user?.name ??
      (typeof token.name === "string" ? token.name : null),
    image:
      session.user?.image ??
      (typeof token.picture === "string" ? token.picture : null),
  };

  return session;
}

export const authConfig = {
  secret: authEnv.authSecret,
  trustHost: authEnv.authTrustHost,
  session: {
    strategy: "jwt",
  },
  providers: [Google],
  callbacks: {
    jwt: applyJwtSessionClaims,
    session: applySessionUserClaims,
  },
} satisfies NextAuthConfig;
