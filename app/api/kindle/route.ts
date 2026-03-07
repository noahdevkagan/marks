import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { data } = await supabase
      .from("kindle_data")
      .select("data, updated_at")
      .eq("user_id", user.id)
      .single();

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: data.data, updated_at: data.updated_at });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    if (!body.data || !body.data.books || !Array.isArray(body.data.books)) {
      return NextResponse.json(
        { error: "Invalid kindle data format" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { error } = await supabase.from("kindle_data").upsert(
      {
        user_id: user.id,
        data: body.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to save kindle data" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
