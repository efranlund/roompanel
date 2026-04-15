import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IPS = ["94.140.48.130"];

export function middleware(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Allow localhost for development
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip === "unknown"
  ) {
    return NextResponse.next();
  }

  if (!ALLOWED_IPS.includes(ip)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
