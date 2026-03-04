import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserStorageUsage, formatBytes } from "@/lib/storage";

export async function GET() {
  try {
    const user = await requireUser();
    const { bytesUsed, storageLimit } = await getUserStorageUsage(user.id);

    return NextResponse.json({
      bytes_used: bytesUsed,
      storage_limit: storageLimit,
      formatted_used: formatBytes(bytesUsed),
      formatted_limit: formatBytes(storageLimit),
      percentage: Math.round((bytesUsed / storageLimit) * 100),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
