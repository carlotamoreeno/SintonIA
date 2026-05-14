import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import { privacyExportStore } from "@/lib/supabase/privacy-export-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    return NextResponse.json(
      {
        message: UNAUTHENTICATED_API_MESSAGE,
      },
      { status: 401 },
    );
  }

  const payload = await privacyExportStore.exportUserData({
    userId: appSession.persistedIdentity.user.id,
  });

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
