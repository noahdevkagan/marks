---
name: test-lib
description: Create a test script for a library module following the assert-based test pattern used in this project. Use when the user wants to test a lib module.
user_invocable: true
---

# Test Library Skill

Generate a test script under `scripts/test-*.ts` for any module in `lib/`.

## Reference

Study `scripts/test-suggest-tags.ts` — it establishes the project's testing pattern:

- Plain TypeScript (no test framework), run with `npx tsx scripts/test-*.ts`
- Simple assert helpers: `assert(condition, message)`, `assertIncludes`, `assertLength`
- Pass/fail counters with colored output
- Exit code 1 on failure
- Grouped test sections with descriptive headers
- Tests pure functions by importing directly from `lib/`

## Template

```typescript
import { functionToTest } from "../lib/module-name";

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

// ─── Test Group ─────────────────────────────────────────────────
console.log("\n1. Description of test group");
{
  // test code here
  assert(result === expected, "description of what's being verified");
}

// ─── Summary ────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

## Workflow

1. **Read** the target `lib/*.ts` module to understand its exports
2. **Identify** pure functions that can be tested without external dependencies (DB, auth)
3. **Create** `scripts/test-{module}.ts` with comprehensive test cases:
   - Happy path with typical inputs
   - Edge cases (empty inputs, special characters, large inputs)
   - Boundary conditions
   - Error cases
4. **Run** the test: `npx tsx scripts/test-{module}.ts`
5. **Fix** any failures, then re-run until all pass
