import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";
  const isPublicPath = isAuthPage || path.startsWith("/api/auth");

  // Fast path: if no auth cookie exists, skip the Supabase network call entirely
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookie) {
    // No session — serve auth pages instantly, redirect everything else to login
    if (isPublicPath) return NextResponse.next({ request });

    if (path.startsWith("/api/") && request.headers.get("authorization")) {
      return NextResponse.next({ request });
    }

    const url = request.nextUrl.clone();
    const redirectTo = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    if (redirectTo !== "/") {
      url.searchParams.set("redirect", redirectTo);
    }
    return NextResponse.redirect(url);
  }

  // Auth cookie exists — validate the session with Supabase
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    if (path.startsWith("/api/") && request.headers.get("authorization")) {
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    const redirectTo = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    if (redirectTo !== "/") {
      url.searchParams.set("redirect", redirectTo);
    }
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|sw\\.js|manifest\\.json|manifest\\.webmanifest).*)",
  ],
};
