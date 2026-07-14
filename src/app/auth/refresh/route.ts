import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@workos-inc/authkit-nextjs";

/**
 * Session-refresh bounce. requireTeacher sends requests here when the
 * access token failed to resolve but a session cookie still exists —
 * a refresh race, not a logout. Route handlers may write cookies, so
 * the refresh can persist; the teacher lands back where they were and
 * never sees /login.
 */
export async function GET(request: NextRequest) {
  const rawNext = request.nextUrl.searchParams.get("next") ?? "/schedule";
  // Only ever bounce to a local path — never an absolute/protocol URL.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/schedule";

  let signedIn = false;
  try {
    const { user } = await refreshSession();
    signedIn = Boolean(user);
  } catch (error) {
    console.error("/auth/refresh: session refresh failed", error);
  }

  return NextResponse.redirect(
    new URL(signedIn ? next : "/login", request.url),
  );
}
