import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { posts, getPost, AUTHOR } from "../posts";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Marks`,
    description: post.description,
    authors: [{ name: AUTHOR }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [AUTHOR],
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <div className="container" style={{ maxWidth: 640, padding: "40px 20px" }}>
      <p style={{ marginBottom: 24 }}>
        <Link href="/blog">← Blog</Link>
      </p>
      <article>
        <h1>{post.title}</h1>
        <p
          style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}
        >
          {AUTHOR} ·{" "}
          {new Date(post.date + "T00:00:00").toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </article>
      <p style={{ marginTop: 40, color: "var(--text-muted)", fontSize: 14 }}>
        Marks is a free bookmark manager and read-later app.{" "}
        <Link href="/">Try it at getmarks.sh</Link>
      </p>
    </div>
  );
}
