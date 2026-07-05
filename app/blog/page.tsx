import type { Metadata } from "next";
import Link from "next/link";
import { posts, AUTHOR } from "./posts";

export const metadata: Metadata = {
  title: "Blog — Marks",
  description:
    "Guides on bookmarks, read-later apps, and getting your data out of dying platforms.",
};

export default function BlogIndex() {
  return (
    <div className="container" style={{ maxWidth: 640, padding: "40px 20px" }}>
      <h1>Marks Blog</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        Notes on bookmarks, reading, and owning your data. By {AUTHOR}.
      </p>

      {posts.map((post) => (
        <article key={post.slug} style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 4 }}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {post.description}
          </p>
        </article>
      ))}

      <p style={{ marginTop: 40 }}>
        <Link href="/">← getmarks.sh</Link>
      </p>
    </div>
  );
}
