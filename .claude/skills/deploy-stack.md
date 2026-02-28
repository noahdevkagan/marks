---
name: deploy-stack
description: Set up a new project with Supabase (database + auth) + Vercel (hosting) + Cloudflare (domain). Use when spinning up a new website or helping configure deployment infrastructure.
user_invocable: true
---

# Deploy Stack Skill — Supabase + Vercel + Cloudflare

Guide the user through setting up a production deployment stack for a Next.js project.

## Prerequisites

Ensure these CLI tools are available:
- `npx supabase` — Supabase CLI
- `npx vercel` — Vercel CLI
- Cloudflare: managed via dashboard (no CLI required, but `wrangler` helps)

## Phase 1: Supabase Setup

### 1.1 Create project
```bash
npx supabase projects create "<project-name>" --org-id <org-id> --db-password "<password>" --region us-east-1
```
Or guide the user through https://supabase.com/dashboard.

### 1.2 Get credentials
The user needs these from Supabase Dashboard → Settings → API:
- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)

### 1.3 Run migrations
If SQL migration files exist in the project root (e.g., `supabase-schema.sql`, `supabase-migration-*.sql`):
```bash
# Run each migration in order via the Supabase SQL editor or CLI
npx supabase db push
```

### 1.4 Enable auth
- Supabase Dashboard → Authentication → Settings
- Enable Email provider (or Google, GitHub, etc.)
- Set Site URL to the final domain (e.g., `https://marks.yourdomain.com`)
- Add redirect URLs: `https://marks.yourdomain.com/**`

## Phase 2: Vercel Setup

### 2.1 Link project
```bash
npx vercel link
```

### 2.2 Set environment variables
```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### 2.3 Deploy
```bash
npx vercel --prod
```

### 2.4 Note the deployment URL
Vercel will give you `project-name.vercel.app` — needed for Cloudflare DNS.

## Phase 3: Cloudflare Domain

### 3.1 Add domain to Cloudflare
- Cloudflare Dashboard → Add Site → Enter domain
- Update nameservers at your registrar to Cloudflare's NS records

### 3.2 Configure DNS
Add a CNAME record:
| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` or subdomain | `cname.vercel-dns.com` | DNS only (gray cloud) |

**Important:** Use "DNS only" (not proxied) for Vercel deployments — Vercel handles SSL.

### 3.3 Configure Vercel domain
```bash
npx vercel domains add yourdomain.com
```
Or: Vercel Dashboard → Project → Settings → Domains → Add `yourdomain.com`

### 3.4 SSL
- Vercel auto-provisions SSL certificates
- In Cloudflare: set SSL/TLS mode to "Full (strict)"

## Phase 4: Post-deployment checklist

- [ ] Update Supabase Auth Site URL to final domain
- [ ] Update Supabase Auth redirect URLs
- [ ] Test sign-up flow end to end
- [ ] Test bookmark creation
- [ ] Verify PWA manifest loads at `/manifest.webmanifest`
- [ ] Test mobile share intent (add to home screen first)
- [ ] Create `.env.local` template in README for local dev

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Auth redirects to wrong URL | Update Supabase Auth → URL Configuration |
| CORS errors | Check Supabase project URL matches env var exactly |
| DNS not resolving | Wait 24-48h for nameserver propagation |
| SSL errors | Ensure Cloudflare SSL is "Full (strict)", not "Flexible" |
| Vercel 404 on custom domain | Run `npx vercel domains verify yourdomain.com` |
