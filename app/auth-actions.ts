"use server";

import { signIn, signOut } from "@/auth";
import {
  DEFAULT_AUTH_REDIRECT_PATH,
  normalizeCallbackPath,
} from "@/lib/auth/access";

function resolveCallbackUrl(formData?: FormData) {
  const rawCallbackUrl = formData?.get("callbackUrl");

  return normalizeCallbackPath(
    typeof rawCallbackUrl === "string"
      ? rawCallbackUrl
      : DEFAULT_AUTH_REDIRECT_PATH,
  );
}

export async function signInWithGoogle(formData?: FormData) {
  await signIn("google", {
    redirectTo: resolveCallbackUrl(formData),
  });
}

export async function signOutCurrentUser() {
  await signOut({
    redirectTo: "/",
  });
}
