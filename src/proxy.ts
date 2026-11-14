import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIES, verifySession } from "@/lib/session";

/**
 * Sends anyone without a valid team session to /login. This is a quick check
 * before rendering; pages and server actions check again themselves.
 * /api is left alone because API routes use token authentication instead.
 */
export async function proxy(request: NextRequest) {
  const allowed = await verifySession(
    request.cookies.get(SESSION_COOKIES.site)?.value,
    "site",
    process.env.SESSION_SECRET,
  );
  if (allowed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
