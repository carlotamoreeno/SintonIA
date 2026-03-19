import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";

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

  return NextResponse.json({
    id: appSession.session.user.id,
    email: appSession.session.user.email ?? null,
    name: appSession.session.user.name ?? null,
    image: appSession.session.user.image ?? null,
    role: appSession.session.user.role,
    expires: appSession.session.expires,
  });
}
