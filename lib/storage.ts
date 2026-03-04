import { createClient } from "./supabase-server";

const BUCKET = "user-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function getUserStorageUsage(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_storage")
    .select("bytes_used, storage_limit")
    .eq("user_id", userId)
    .single();

  return {
    bytesUsed: data?.bytes_used ?? 0,
    storageLimit: data?.storage_limit ?? 1073741824, // 1 GB default
  };
}

export async function checkStorageLimit(
  userId: string,
  additionalBytes: number,
): Promise<boolean> {
  const { bytesUsed, storageLimit } = await getUserStorageUsage(userId);
  return bytesUsed + additionalBytes <= storageLimit;
}

export async function uploadToStorage(
  userId: string,
  bookmarkId: number,
  filename: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  mediaType: string,
  originalUrl?: string,
): Promise<{ path: string; size: number } | null> {
  const fileData =
    typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const fileSize = fileData.length;

  // Enforce per-file limit
  if (fileSize > MAX_FILE_SIZE) return null;

  // Check storage limit
  const hasSpace = await checkStorageLimit(userId, fileSize);
  if (!hasSpace) return null;

  const storagePath = `${userId}/${bookmarkId}/${filename}`;
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileData, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return null;
  }

  // Record in stored_media table
  await supabase.from("stored_media").insert({
    bookmark_id: bookmarkId,
    user_id: userId,
    storage_path: storagePath,
    media_type: mediaType,
    original_url: originalUrl ?? null,
    file_size: fileSize,
    content_type: contentType,
  });

  // Increment storage usage atomically
  await supabase.rpc("increment_storage_usage", {
    p_user_id: userId,
    p_bytes: fileSize,
  });

  return { path: storagePath, size: fileSize };
}

export async function getSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600); // 1 hour expiry

  if (error) {
    console.error("Signed URL error:", error);
    return null;
  }

  return data.signedUrl;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
