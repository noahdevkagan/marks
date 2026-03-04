"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StorageInfo = {
  bytes_used: number;
  storage_limit: number;
  formatted_used: string;
  formatted_limit: string;
  percentage: number;
};

type StorageFile = {
  media_type: string;
  file_size: number;
  formatted_size: string;
  content_type: string;
  created_at: string;
};

type StorageGroup = {
  bookmark_id: number;
  bookmark_title: string;
  bookmark_url: string;
  total_size: number;
  formatted_size: string;
  files: StorageFile[];
};

type StorageFiles = {
  total_files: number;
  total_size: string;
  grouped: StorageGroup[];
};

const MEDIA_LABELS: Record<string, string> = {
  html_archive: "Article HTML",
  text_archive: "Article text",
  thumbnail: "Thumbnail",
};

export default function SettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [files, setFiles] = useState<StorageFiles | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/storage")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/storage/files")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([storageData, filesData]) => {
      if (storageData && !storageData.error) setStorage(storageData);
      if (filesData && !filesData.error) setFiles(filesData);
      setLoading(false);
    });
  }, []);

  return (
    <div className="container">
      <header>
        <h1>Settings</h1>
        <nav>
          <Link href="/">all</Link>
          <Link href="/read">read later</Link>
          <Link href="/actions">actions</Link>
          <Link href="/stats">stats</Link>
          <Link href="/add" className="nav-add">
            + add
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="nav-signout">
              sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="settings-section">
        <h2 className="settings-heading">Storage</h2>
        {loading ? (
          <p className="settings-loading">Loading...</p>
        ) : storage ? (
          <>
            <div className="storage-card">
              <div className="storage-header">
                <span className="storage-title">
                  {storage.formatted_used} used
                </span>
                <span className="storage-usage">
                  {storage.formatted_limit} limit
                </span>
              </div>
              <div className="storage-bar-bg">
                <div
                  className="storage-bar-fill"
                  style={{
                    width: `${Math.min(storage.percentage, 100)}%`,
                  }}
                />
              </div>
              <p className="storage-note">
                {storage.percentage < 80
                  ? "Saves copies of articles, thumbnails, and media. 1 GB free."
                  : storage.percentage < 100
                    ? "Getting close to your limit. Upgrade for more space."
                    : "Storage full. New uploads will be skipped until you upgrade."}
              </p>
            </div>

            {files && files.grouped.length > 0 && (
              <div className="storage-files">
                <h3 className="storage-files-heading">
                  {files.total_files} files stored
                </h3>
                <ul className="storage-file-list">
                  {files.grouped.map((group) => (
                    <li key={group.bookmark_id} className="storage-file-group">
                      <div className="storage-file-bookmark">
                        <a
                          href={`/reader/${group.bookmark_id}`}
                          className="storage-file-title"
                        >
                          {group.bookmark_title}
                        </a>
                        <span className="storage-file-size">
                          {group.formatted_size}
                        </span>
                      </div>
                      <div className="storage-file-details">
                        {group.files.map((f, i) => (
                          <span key={i} className="storage-file-tag">
                            {MEDIA_LABELS[f.media_type] || f.media_type}{" "}
                            <span className="date">{f.formatted_size}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="settings-loading">Could not load storage info.</p>
        )}
      </div>

      <div className="settings-section">
        <h2 className="settings-heading">Account</h2>
        <form action="/api/auth/signout" method="POST">
          <button type="submit" className="settings-signout-btn">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
