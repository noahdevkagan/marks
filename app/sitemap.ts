import type { MetadataRoute } from "next";
import { posts } from "./blog/posts";

const BASE_URL = "https://getmarks.sh";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = ["", "/blog", "/privacy", "/support"].map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: "weekly" as const,
  }));

  const blogPosts = posts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "monthly" as const,
  }));

  return [...staticPages, ...blogPosts];
}
