import "server-only";

import { auth } from "@/auth";
import {
  hydrateSessionWithPersistedIdentity,
  syncPersistedIdentity,
  type AuthenticatedAppSession,
} from "./persisted-identity";

export async function getOptionalAppSession() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const persistedIdentity = await syncPersistedIdentity(
    session as AuthenticatedAppSession,
  );

  return {
    persistedIdentity,
    session: hydrateSessionWithPersistedIdentity(
      session as AuthenticatedAppSession,
      persistedIdentity,
    ),
  };
}
