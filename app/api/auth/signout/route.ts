import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const response = NextResponse.redirect(url);

  // Belt-and-suspenders: explicitly clear any Supabase auth cookies on the response,
  // so the redirected request to /login carries no stale session.
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
