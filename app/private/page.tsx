"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SiteStats = {
  total_bookmarks: number;
  total_users: number;
  total_tags: number;
  total_reading_sessions: number;
  total_reading_seconds: number;
  total_words_read: number;
  bookmarks_this_week: number;
  bookmarks_this_month: number;
  bookmarks_by_type: Record<string, number>;
  daily_bookmarks: { day: string; bookmarks: number; users: number }[];
  new_users_by_day: { day: string; new_users: number }[];
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function PrivatePage() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/site-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="container stats-container">
      <header>
        <h1>Marks — Usage</h1>
        <nav>
          <Link href="/">home</Link>
          <Link href="/privacy">privacy</Link>
        </nav>
      </header>

      {loading ? (
        <p className="stats-loading">Loading...</p>
      ) : stats ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">
                {formatNumber(stats.total_bookmarks)}
              </span>
              <span className="stat-label">bookmarks saved</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.total_users}</span>
              <span className="stat-label">users</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatNumber(stats.total_tags)}
              </span>
              <span className="stat-label">tags created</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatNumber(stats.total_words_read)}
              </span>
              <span className="stat-label">words read</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatDuration(stats.total_reading_seconds)}
              </span>
              <span className="stat-label">time reading</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {formatNumber(stats.total_reading_sessions)}
              </span>
              <span className="stat-label">reading sessions</span>
            </div>
          </div>

          <div className="stats-section">
            <h2>Recent activity</h2>
            <div className="stats-period">
              <span>
                <strong>{stats.bookmarks_this_week}</strong> bookmarks this week
              </span>
              <span>
                <strong>{stats.bookmarks_this_month}</strong> bookmarks this
                month
              </span>
            </div>
          </div>

          {stats.daily_bookmarks.length > 0 && (() => {
            const maxDaily = Math.max(...stats.daily_bookmarks.map((d) => d.bookmarks), 1);
            return (
              <div className="stats-section">
                <h2>Bookmarks per day (last 30 days)</h2>
                <div className="stats-chart">
                  {stats.daily_bookmarks.map((d) => (
                    <div
                      key={d.day}
                      className="chart-bar-wrap"
                      title={`${new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${d.bookmarks} bookmarks, ${d.users} active users`}
                    >
                      <div
                        className="chart-bar"
                        style={{
                          height: `${Math.max((d.bookmarks / maxDaily) * 100, 2)}%`,
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
            );
          })()}

          {stats.new_users_by_day.length > 0 && (
            <div className="stats-section">
              <h2>New users</h2>
              <ul className="stats-top-days">
                {stats.new_users_by_day.map((d) => (
                  <li key={d.day}>
                    <span className="top-day-date">
                      {new Date(d.day).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="top-day-stats">
                      {d.new_users} new {d.new_users === 1 ? "user" : "users"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(stats.bookmarks_by_type).length > 0 && (
            <div className="stats-section">
              <h2>Bookmarks by type</h2>
              <ul className="stats-top-days">
                {Object.entries(stats.bookmarks_by_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <li key={type}>
                      <span className="top-day-date">{type}</span>
                      <span className="top-day-stats">
                        {formatNumber(count)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="empty">
          <p>Could not load stats.</p>
        </div>
      )}
    </div>
  );
}
