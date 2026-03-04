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

export default function SettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setStorage(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
