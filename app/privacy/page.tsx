import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Marks",
  description: "Privacy policy for the Marks bookmark manager and browser extension.",
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 640, padding: "40px 20px" }}>
      <h1>Marks — Privacy Policy</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        Last updated: March 3, 2026
      </p>

      <h2>What Marks Does</h2>
      <p>
        Marks is a bookmark manager with a browser extension that lets you save
        bookmarks with tags and notes. It connects to your Marks account to
        store and retrieve your bookmarks.
      </p>

      <h2>Data We Collect</h2>
      <ul>
        <li>
          <strong>Page URL and title</strong> — captured from the active tab
          when you save a bookmark.
        </li>
        <li>
          <strong>Page HTML</strong> — captured for offline archiving when you
          save a bookmark. Stored on your Marks account only.
        </li>
        <li>
          <strong>Authentication token</strong> — stored locally in Chrome
          storage to keep you signed in. Never shared.
        </li>
        <li>
          <strong>Tags and notes</strong> — any tags or notes you manually add
          to a bookmark.
        </li>
      </ul>

      <h2>Data We Do NOT Collect</h2>
      <ul>
        <li>Browsing history or activity on pages you don&apos;t save</li>
        <li>Personal or financial information</li>
        <li>Cookies or tracking identifiers</li>
        <li>Data from other extensions</li>
      </ul>

      <h2>How Data Is Used</h2>
      <p>
        All collected data is used solely to provide the bookmark-saving
        functionality. Page URLs are sent to the Marks API to generate
        AI-powered tag suggestions. Page HTML is sent to the Marks API for
        offline archiving. No data is sold, shared with third parties, or used
        for advertising.
      </p>

      <h2>Data Storage</h2>
      <p>
        Your bookmarks and archived pages are stored on Marks servers (hosted
        via Supabase and Vercel). Authentication tokens are stored locally in
        Chrome&apos;s extension storage and are never transmitted to third parties.
      </p>

      <h2>Third-Party Services</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and database hosting
        </li>
        <li>
          <strong>Vercel</strong> — API and application hosting
        </li>
      </ul>

      <h2>Your Rights</h2>
      <p>
        You can delete your bookmarks at any time through the Marks web app at{" "}
        <Link href="/">getmarks.sh</Link>. Signing out of the extension removes
        your authentication token from local storage. You can request full
        account and data deletion by contacting us.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach out at{" "}
        <Link href="/">getmarks.sh</Link> or the Marks GitHub repository:{" "}
        <a
          href="https://github.com/crxnamja/marks"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/crxnamja/marks
        </a>
      </p>
    </div>
  );
}
