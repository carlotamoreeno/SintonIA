import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      {
        message: UNAUTHENTICATED_API_MESSAGE,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: session.user.role,
    expires: session.expires,
  });
}
