---
name: add-api-route
description: Scaffold a new Next.js API route with auth, validation, and error handling matching the existing patterns in this codebase. Use when the user wants to add a new API endpoint.
user_invocable: true
---

# Add API Route Skill

Create a new API route under `app/api/` following the established patterns in this codebase.

## Reference Files

Read these before generating:
- `app/api/bookmarks/route.ts` — GET (list) + POST (create) pattern
- `app/api/bookmarks/[id]/route.ts` — GET/PUT/DELETE with dynamic params
- `app/api/suggest-tags/route.ts` — GET with query params
- `app/api/search/route.ts` — GET with search query
- `lib/auth.ts` — `requireUser()` for auth
- `lib/db.ts` — database access patterns

## Pattern

Every route must:
1. Import `requireUser` from `@/lib/auth`
2. Call `await requireUser()` as the first line in every handler
3. Return proper error responses:
   - `401` for auth failures
   - `400` for invalid input (validate URL, required fields)
   - `404` for missing resources
   - `500` for unexpected server errors (NOT 401 for everything)
4. Use `NextRequest` and `NextResponse` from `next/server`

## Template

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    // ... validate params, call db, return response
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

## Workflow

1. **Ask** what the endpoint should do (if not specified)
2. **Create** the route file at `app/api/{name}/route.ts`
3. **Add** any needed DB helper functions to `lib/db.ts`
4. **Test** the endpoint with a curl example in the commit message
