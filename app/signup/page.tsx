"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const saveSlug = searchParams.get("save");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sharedTitle, setSharedTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!saveSlug) return;
    // Fetch public bookmark title for the banner
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
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback${saveSlug ? `?save=${saveSlug}` : ""}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    fetch("/api/auth/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});

    if (data.session) {
      if (saveSlug) {
        // Auto-save the shared article as their first bookmark
        try {
          const res = await fetch("/api/save-shared", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: saveSlug }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.bookmark_id) {
              window.location.href = `/reader/${data.bookmark_id}`;
              return;
            }
          }
        } catch {
          // fall through to home
        }
      }
      window.location.href = "/";
    } else {
      window.location.href = `/?confirm=1${saveSlug ? `&save=${saveSlug}` : ""}`;
    }
  }

  return (
    <div className="container auth-container">
      <h1>Marks</h1>
      <p className="auth-subtitle">Create your account</p>

      <form onSubmit={handleSubmit} className="auth-form">
        {saveSlug && (
          <div className="signup-save-banner">
            📌 We&rsquo;ll save{" "}
            <strong>
              {sharedTitle ? `“${sharedTitle}”` : "this article"}
            </strong>{" "}
            to your library as soon as you sign up.
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
          minLength={6}
          autoComplete="new-password"
        />

        <button type="submit" disabled={loading}>
          {loading
            ? "Creating account..."
            : saveSlug
              ? "Sign up & save article"
              : "Sign up"}
        </button>
      </form>

      <p className="auth-footer">
        Already have an account?{" "}
        <Link href={saveSlug ? `/login?save=${saveSlug}` : "/login"}>Sign in</Link>
      </p>
    </div>
  );
}
