import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      emailVerified?: boolean;
      role: AppRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    authSubject?: string;
    emailVerified?: boolean;
    provider?: string;
    role?: AppRole;
  }
}
