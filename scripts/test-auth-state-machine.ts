/**
 * Verifies the auth state-machine logic in the iOS app.
 *
 * This is a TypeScript port of the control flow in:
 *   - ios/Marks/Services/SupabaseService.swift (refreshSession + validateSession)
 *   - ios/Marks/ViewModels/AuthViewModel.swift (checkSession)
 *
 * The point is to catch the bugs the original code had:
 *   1. checkSession flipped to signed-out on ANY failure (including network)
 *   2. refreshSession cleared tokens on ANY non-2xx (including 5xx)
 *
 * Run: npx tsx scripts/test-auth-state-machine.ts
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

// ─── State machine (mirrors Swift) ────────────────────────────────

type HttpResult =
  | { kind: "status"; status: number; body?: string }
  | { kind: "networkError" };

type SessionValidation = "valid" | "invalid" | "unreachable";

class FakeTokenStore {
  access: string | null = null;
  refresh: string | null = null;

  clear() {
    this.access = null;
    this.refresh = null;
  }

  save(access: string, refresh: string) {
    this.access = access;
    this.refresh = refresh;
  }
}

class FakeSupabase {
  store = new FakeTokenStore();
  // Sequence of responses: first userResp (for /auth/v1/user), then refreshResp.
  userResp: HttpResult = { kind: "status", status: 200, body: "user" };
  refreshResp: HttpResult = { kind: "status", status: 200, body: "ok" };

  // Mirrors refreshSession() in SupabaseService.swift after the fix.
  async refreshSession(): Promise<boolean> {
    if (!this.store.refresh) return false;
    const r = this.refreshResp;
    if (r.kind === "networkError") {
      throw new Error("network");
    }
    if (r.status >= 200 && r.status < 300) {
      this.store.save("new-access", "new-refresh");
      return true;
    }
    if (r.status === 401 || r.status === 403 || r.status === 400) {
      this.store.clear();
      return false;
    }
    throw new Error(`HTTP ${r.status}`);
  }

  // Mirrors request() — issues the user request, retries via refresh on 401.
  async getUser(): Promise<string> {
    const r = this.userResp;
    if (r.kind === "networkError") throw new Error("network");
    if (r.status === 401) {
      const ok = await this.refreshSession();
      if (ok) return "user";
      throw new Error("unauthorized");
    }
    if (r.status >= 200 && r.status < 300) return "user";
    throw new Error(`HTTP ${r.status}`);
  }

  // Mirrors validateSession() — distinguishes invalid vs unreachable.
  async validateSession(): Promise<SessionValidation> {
    if (!this.store.access) return "invalid";
    try {
      await this.getUser();
      return "valid";
    } catch {
      if (!this.store.access) return "invalid";
      return "unreachable";
    }
  }
}

// Mirrors AuthViewModel.checkSession() after the fix.
async function checkSession(s: FakeSupabase): Promise<boolean> {
  const optimistic = !!(s.store.access && s.store.refresh);
  let isSignedIn = optimistic;
  if (!optimistic) return false;
  switch (await s.validateSession()) {
    case "valid": isSignedIn = true; break;
    case "invalid": isSignedIn = false; break;
    case "unreachable": /* keep optimistic */ break;
  }
  return isSignedIn;
}

// ─── Tests ────────────────────────────────────────────────────────

async function run() {
  console.log("auth state machine");

  // 1. Happy path: valid access token → stay signed in.
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 200 };
    const out = await checkSession(s);
    assert(out === true, "valid token → signed in");
    assert(s.store.access === "a", "valid token → tokens preserved");
  }

  // 2. Confirmed invalid: 401 + refresh rejected (401/403/400) → signed out, tokens cleared.
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 401 };
    s.refreshResp = { kind: "status", status: 401 };
    const out = await checkSession(s);
    assert(out === false, "refresh rejected → signed out");
    assert(s.store.access === null, "refresh rejected → tokens cleared");
  }

  // 3. Transient network error on user check → stay signed in (optimistic).
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "networkError" };
    const out = await checkSession(s);
    assert(out === true, "network error → stay signed in");
    assert(s.store.access === "a", "network error → tokens preserved");
  }

  // 4. Server 5xx on refresh attempt → stay signed in, tokens preserved.
  //    This is the core bug-fix: previously, ANY non-2xx cleared tokens.
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 401 };
    s.refreshResp = { kind: "status", status: 503 };
    const out = await checkSession(s);
    assert(out === true, "5xx during refresh → stay signed in (transient)");
    assert(s.store.access === "a", "5xx during refresh → tokens preserved");
  }

  // 5. Network error during refresh → stay signed in, tokens preserved.
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 401 };
    s.refreshResp = { kind: "networkError" };
    const out = await checkSession(s);
    assert(out === true, "network error during refresh → stay signed in");
    assert(s.store.access === "a", "network error during refresh → tokens preserved");
  }

  // 6. Successful refresh after 401 → user request succeeds, signed in.
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 401 };
    s.refreshResp = { kind: "status", status: 200 };
    const out = await checkSession(s);
    assert(out === true, "401 then good refresh → signed in");
    assert(s.store.access === "new-access", "401 then good refresh → token rotated");
  }

  // 7. No tokens stored → signed out without any network call.
  {
    const s = new FakeSupabase();
    s.userResp = { kind: "networkError" }; // would fail if reached
    const out = await checkSession(s);
    assert(out === false, "no tokens → signed out (no network)");
  }

  // 8. Refresh rejected with 403 also clears tokens (delete-account-style case).
  {
    const s = new FakeSupabase();
    s.store.save("a", "r");
    s.userResp = { kind: "status", status: 401 };
    s.refreshResp = { kind: "status", status: 403 };
    const out = await checkSession(s);
    assert(out === false, "refresh 403 → signed out");
    assert(s.store.access === null, "refresh 403 → tokens cleared");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
