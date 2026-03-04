"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = {
  total_articles_read: number;
  total_words_read: number;
  total_reading_seconds: number;
  articles_this_week: number;
  articles_this_month: number;
  streak_days: number;
  daily_reading: { day: string; articles: number; seconds: number; words: number }[];
  top_reading_days: { day: string; articles: number; words: number }[];
};

type StorageInfo = {
  bytes_used: number;
  storage_limit: number;
  formatted_used: string;
  formatted_limit: string;
  percentage: number;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

function formatWords(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/reading-stats")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/storage")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([statsData, storageData]) => {
      if (statsData && !statsData.error) setStats(statsData);
      if (storageData && !storageData.error) setStorage(storageData);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="container stats-container">
        <header>
          <h1>Reading Stats</h1>
          <nav>
            <Link href="/">all</Link>
            <Link href="/read">read later</Link>
            <Link href="/actions">actions</Link>
            <Link href="/stats">stats</Link>
          </nav>
        </header>
        <p className="stats-loading">Loading...</p>
      </div>
    );
  }

  const maxDailyWords = stats
    ? Math.max(...stats.daily_reading.map((d) => d.words), 1)
    : 1;

  return (
    <div className="container stats-container">
      <header>
        <h1>Reading Stats</h1>
        <nav>
          <Link href="/">all</Link>
          <Link href="/read">read later</Link>
          <Link href="/actions">actions</Link>
          <Link href="/stats">stats</Link>
        </nav>
      </header>

      {stats ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.total_articles_read}</span>
              <span className="stat-label">articles read</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatWords(stats.total_words_read)}</span>
              <span className="stat-label">words consumed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatDuration(stats.total_reading_seconds)}
              </span>
              <span className="stat-label">time reading</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.streak_days}</span>
              <span className="stat-label">day streak</span>
            </div>
          </div>

          <div className="stats-section">
            <h2>This period</h2>
            <div className="stats-period">
              <span>
                <strong>{stats.articles_this_week}</strong> articles this week
              </span>
              <span>
                <strong>{stats.articles_this_month}</strong> articles this month
              </span>
            </div>
          </div>

          {stats.daily_reading.length > 0 && (
            <div className="stats-section">
              <h2>Last 30 days</h2>
              <div className="stats-chart">
                {stats.daily_reading.map((d) => (
                  <div key={d.day} className="chart-bar-wrap" title={`${new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${d.articles} articles, ${formatWords(d.words)} words`}>
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.max((d.words / maxDailyWords) * 100, 2)}%`,
                      }}
                    />
                    {new Date(d.day).getDay() === 1 && (
                      <span className="chart-label">
                        {new Date(d.day).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.top_reading_days.length > 0 && (
            <div className="stats-section">
              <h2>Best reading days</h2>
              <ul className="stats-top-days">
                {stats.top_reading_days.map((d) => (
                  <li key={d.day}>
                    <span className="top-day-date">
                      {new Date(d.day).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="top-day-stats">
                      {d.articles} articles &middot; {formatWords(d.words)} words
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="empty">
          <p>No reading data yet. Start reading some articles!</p>
        </div>
      )}

      {storage && (
        <div className="storage-card">
          <div className="storage-header">
            <span className="storage-title">Storage</span>
            <span className="storage-usage">
              {storage.formatted_used} / {storage.formatted_limit}
            </span>
          </div>
          <div className="storage-bar-bg">
            <div
              className="storage-bar-fill"
              style={{ width: `${Math.min(storage.percentage, 100)}%` }}
            />
          </div>
          <p className="storage-note">
            {storage.percentage < 80
              ? "Archives, thumbnails, and media are stored durably."
              : storage.percentage < 100
                ? "Getting close to your limit. Consider upgrading soon."
                : "Storage limit reached. New uploads will be skipped."}
          </p>
        </div>
      )}
    </div>
  );
}
