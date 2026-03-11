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
        Last updated: March 8, 2026
      </p>

      <h2>What Marks Does</h2>
      <p>
        Marks is a bookmark manager with a browser extension. It lets you save
        web pages as bookmarks with tags and notes, archive page content for
        offline reading, sync Kindle highlights from Amazon, and get AI-powered
        tag suggestions. The extension connects to your Marks account to store
        and retrieve your data.
      </p>

      <h2>Data We Collect</h2>
      <ul>
        <li>
          <strong>Page URL and title</strong> — captured from the active tab when
          you explicitly save a bookmark. This data is only collected when you
          initiate a save action.
        </li>
        <li>
          <strong>Page content and HTML</strong> — captured for offline archiving
          when you save a bookmark. On Twitter/X, tweet text, author handle, and
          media URLs are extracted for rich bookmark display.
        </li>
        <li>
          <strong>Kindle highlights</strong> — when you use the Kindle sync
          feature, the extension navigates to read.amazon.com/notebook and
          extracts your book highlights, notes, titles, authors, and cover
          images. This only happens when you explicitly start a sync.
        </li>
        <li>
          <strong>Tags and notes</strong> — any tags or notes you manually add to
          a bookmark.
        </li>
        <li>
          <strong>Authentication credentials</strong> — your email and password
          are used to authenticate with Supabase. Access and refresh tokens are
          stored locally in Chrome extension storage to keep you signed in.
        </li>
      </ul>

      <h2>Data We Do NOT Collect</h2>
      <ul>
        <li>
          Browsing history or activity on pages you don&apos;t explicitly save
        </li>
        <li>Personal or financial information</li>
        <li>Cookies or tracking identifiers</li>
        <li>
          Data from other extensions or tabs you don&apos;t interact with
        </li>
        <li>
          Any data when the extension is idle — all collection requires user
          action
        </li>
      </ul>

      <h2>How Data Is Collected (Extension Permissions)</h2>
      <p>The extension requests the following browser permissions:</p>
      <ul>
        <li>
          <strong>activeTab</strong> — to read the URL and title of the current
          tab when you save a bookmark.
        </li>
        <li>
          <strong>scripting</strong> — to extract page content (HTML, tweet text,
          og:title metadata) from the active tab for archiving and rich bookmark
          display.
        </li>
        <li>
          <strong>storage</strong> — to store your authentication tokens locally
          so you stay signed in.
        </li>
        <li>
          <strong>contextMenus</strong> — to add &quot;Save to Marks&quot;
          options to the right-click menu.
        </li>
        <li>
          <strong>host_permissions (https://*/*)</strong> — required to extract
          page content from any website you choose to bookmark, and to
          communicate with the Marks API and Supabase authentication service.
        </li>
      </ul>
      <p>
        Content scripts run on specific sites only: Twitter/X (for tweet
        extraction), read.amazon.com (for Kindle highlight sync), archive.today
        (for archived page capture), and getmarks.sh (for extension-app
        communication).
      </p>

      <h2>How Data Is Used</h2>
      <ul>
        <li>
          <strong>Bookmark storage</strong> — URLs, titles, tags, notes, and page
          content are stored on your Marks account for retrieval and search.
        </li>
        <li>
          <strong>Offline archiving</strong> — page HTML is stored so you can
          read saved pages even if the original goes offline.
        </li>
        <li>
          <strong>AI-powered tag suggestions</strong> — when you save a bookmark,
          the page URL, title, and description are sent to the Marks API, which
          forwards them to Anthropic&apos;s Claude AI to generate tag
          suggestions. Only the URL, title, and a short description are sent —
          not the full page HTML.
        </li>
        <li>
          <strong>AI-powered article enrichment</strong> — when you view a saved
          bookmark, its content may be sent to Anthropic&apos;s Claude AI for
          summarization and action item extraction.
        </li>
        <li>
          <strong>Kindle sync</strong> — your Kindle highlights are sent to the
          Marks API and stored in your account for browsing and search.
        </li>
      </ul>
      <p>
        No data is sold, shared with third parties for advertising, or used for
        any purpose other than providing the Marks service.
      </p>

      <h2>Data Storage and Security</h2>
      <ul>
        <li>
          <strong>Server-side data</strong> — bookmarks, archived pages, and
          Kindle highlights are stored on Marks servers hosted via Supabase
          (database) and Vercel (API/application). Data is transmitted over
          HTTPS.
        </li>
        <li>
          <strong>Local data</strong> — authentication tokens (access token and
          refresh token) are stored in Chrome&apos;s extension storage on your
          device. These are never transmitted to third parties.
        </li>
        <li>
          <strong>Supabase authentication</strong> — your Supabase API key is
          stored locally to enable token refresh. Authentication is handled by
          Supabase&apos;s auth service.
        </li>
      </ul>

      <h2>Data Sharing</h2>
      <p>
        Your data is shared with the following third-party services solely to
        provide the Marks functionality:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and database hosting. Stores
          your account, bookmarks, and Kindle highlights.{" "}
          <a
            href="https://supabase.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase Privacy Policy
          </a>
        </li>
        <li>
          <strong>Vercel</strong> — API and application hosting. Processes API
          requests.{" "}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vercel Privacy Policy
          </a>
        </li>
        <li>
          <strong>Anthropic (Claude AI)</strong> — provides AI-powered tag
          suggestions and article enrichment. Receives bookmark URLs, titles, and
          content excerpts.{" "}
          <a
            href="https://www.anthropic.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Anthropic Privacy Policy
          </a>
        </li>
      </ul>
      <p>
        No data is shared with any other third parties, advertisers, or data
        brokers.
      </p>

      <h2>Data Retention</h2>
      <p>
        Your data is retained for as long as your Marks account is active. You
        can delete individual bookmarks or Kindle highlights at any time through
        the Marks web app. If you request account deletion, all associated data
        (bookmarks, archived pages, Kindle highlights, and account information)
        will be permanently deleted from our servers within 30 days.
      </p>

      <h2>Your Rights</h2>
      <ul>
        <li>
          <strong>Access</strong> — view all your stored data through the Marks
          web app at <Link href="/">getmarks.sh</Link>.
        </li>
        <li>
          <strong>Deletion</strong> — delete individual bookmarks or highlights
          at any time. Request full account and data deletion by contacting us.
        </li>
        <li>
          <strong>Portability</strong> — your bookmarks and highlights are
          accessible through the Marks web app.
        </li>
        <li>
          <strong>Sign out</strong> — signing out of the extension removes your
          authentication tokens from local storage.
        </li>
        <li>
          <strong>Uninstall</strong> — removing the extension deletes all locally
          stored data (tokens). Server-side data remains until you delete it or
          your account.
        </li>
      </ul>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this privacy policy from time to time. Changes will be
        posted on this page with an updated date. Continued use of the extension
        after changes constitutes acceptance of the updated policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach out at{" "}
        <Link href="/">getmarks.sh</Link> or the Marks GitHub repository:{" "}
        <a
          href="https://github.com/noahdevkagan/marks"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/noahdevkagan/marks
        </a>
      </p>
    </div>
  );
}
