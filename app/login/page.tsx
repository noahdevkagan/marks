"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sharedTitle, setSharedTitle] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const saveSlug = searchParams.get("save");

  useEffect(() => {
    if (!saveSlug) return;
    fetch(`/api/save-shared/preview?slug=${encodeURIComponent(saveSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.title && setSharedTitle(d.title))
      .catch(() => {});
  }, [saveSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (saveSlug) {
      try {
        const res = await fetch("/api/save-shared", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: saveSlug }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.bookmark_id) {
            router.push(`/reader/${data.bookmark_id}`);
            router.refresh();
            return;
          }
        }
      } catch {
        // fall through
      }
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="container auth-container">
      <h1>Marks</h1>
      <p className="auth-subtitle">Sign in to your bookmarks</p>

      <form onSubmit={handleSubmit} className="auth-form">
        {saveSlug && (
          <div className="signup-save-banner">
            📌 We&rsquo;ll save{" "}
            <strong>
              {sharedTitle ? `“${sharedTitle}”` : "this article"}
            </strong>{" "}
            to your library after you sign in.
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="auth-footer">
        No account?{" "}
        <Link href={saveSlug ? `/signup?save=${saveSlug}` : "/signup"}>Sign up</Link>
      </p>
    </div>
  );
}
