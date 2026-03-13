import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — Marks",
  description: "Get help with the Marks bookmark manager.",
};

export default function SupportPage() {
  return (
    <div className="container" style={{ maxWidth: 640, padding: "40px 20px" }}>
      <h1>Marks — Support</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        Need help? Here are the best ways to get in touch.
      </p>

      <h2>Report a Bug or Request a Feature</h2>
      <p>
        Open an issue on GitHub:{" "}
        <a
          href="https://github.com/crxnamja/marks/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/crxnamja/marks/issues
        </a>
      </p>

      <h2>Common Questions</h2>

      <h3>How do I save a bookmark?</h3>
      <p>
        On the web, use the browser extension or the bookmarklet. On iOS, use
        the share extension — tap the share button in Safari or any app and
        select Marks.
      </p>

      <h3>How does sync work?</h3>
      <p>
        Bookmarks sync automatically between the web app and the iOS app via
        your Marks account. Pull to refresh on iOS to trigger a manual sync.
      </p>

      <h3>Can I export my data?</h3>
      <p>
        Yes. Go to <Link href="/settings">Settings</Link> on the web app to
        export your bookmarks as JSON.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        Open an issue on GitHub or contact us to request full account and data
        deletion.
      </p>

      <h2>Contact</h2>
      <p>
        Reach out via the{" "}
        <a
          href="https://github.com/crxnamja/marks"
          target="_blank"
          rel="noopener noreferrer"
        >
          Marks GitHub repository
        </a>
        .
      </p>
    </div>
  );
}
