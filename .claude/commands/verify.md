---
description: "Verify build, deployment, and feature functionality before presenting results"
---

# Verify: Build + Deploy + Test

Run this after making changes to verify everything works end-to-end. Do NOT present results to the user until all checks pass.

## Step 1: Build Check

Run the Next.js production build:
```bash
cd /Users/sunflower/marks && npm run build
```

If the build fails:
- Read the error output carefully
- Fix the issue
- Re-run the build
- Do NOT proceed until the build passes

## Step 2: Run Test Scripts

Check for and run any test scripts:
```bash
ls /Users/sunflower/marks/scripts/test-*.ts 2>/dev/null
```

For each test file found, run it with `npx tsx` and verify it passes.

## Step 3: Push and Check Deployment

If there are uncommitted changes, commit and push to main. Then wait for Vercel to deploy:

```bash
cd /Users/sunflower/marks && gh api repos/noahdevkagan/marks/deployments --jq '.[0] | {sha: .sha[0:8], created_at: .created_at}'
```

Check deployment status:
```bash
cd /Users/sunflower/marks && gh api repos/noahdevkagan/marks/deployments --jq '.[0].statuses_url' | xargs gh api --jq '.[0].state'
```

If deployment failed, check the build logs and fix.

## Step 4: API Smoke Tests

Hit core production endpoints and verify expected HTTP status codes:

```bash
# Should return 401 (auth required)
curl -s -o /dev/null -w "%{http_code}" https://marks-drab.vercel.app/api/bookmarks

# Should return 401 (auth required)
curl -s -o /dev/null -w "%{http_code}" https://marks-drab.vercel.app/api/search?q=test

# Suggest tags should return 401 (not 500)
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer fake" https://marks-drab.vercel.app/api/suggest-tags?url=https://example.com
```

Any 500 errors indicate a server-side crash that needs fixing.

## Step 5: Extension Check

If extension files were modified:
- Bump the version in `extension/manifest.json` (patch for fixes, minor for features)
- Verify the extension loads without errors by checking `chrome://extensions`

## Step 6: Report Results

Present a summary:

| Check | Status |
|-------|--------|
| Build | PASS/FAIL |
| Tests | PASS/FAIL |
| Vercel deploy | PASS/FAIL |
| API endpoints | PASS/FAIL |
| Extension | PASS/FAIL or N/A |

Only tell the user "done" if everything passes. If anything failed, explain what broke and fix it first.
