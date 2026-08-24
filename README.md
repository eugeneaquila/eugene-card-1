# Eugene Card — Phase 9 E2E Verification / Supabase Cutover Update

This is the Phase 9 update of the Eugene Card Firebase → Supabase migration.

## Included
- `index(9).html` — current Eugene Card frontend
- `js/supabase-init.js` — Supabase client bootstrap
- `js/supabase-firebase-compat.js` — Phase 9 schema-aware compatibility bridge; no Firebase SDK/network calls
- `phase8.sql` — additive schema/policies from Phase 8
- `PHASE9-VERIFICATION.md` — verification checklist and status
- `phase9-smoke-test.js` — static smoke test

## Phase 9 fixes
- Maps legacy profile email document IDs to the authenticated Supabase UUID.
- Maps legacy card fields (`serial`, `imgUrl`, `price`, `edition`, etc.) into the real `cards` PostgreSQL schema and preserves legacy fields in `metadata`.
- Maps legacy listing IDs/payloads into the real `listings` schema.
- Maps legacy transaction IDs/payloads into the real `transactions` schema and preserves the original order reference in `metadata.legacy_id`.
- Resolves legacy listing/transaction IDs through metadata when they are not UUIDs.
- Keeps the existing UI's Firestore-shaped API while all persistence remains Supabase.
- Hardened `trade_requests` RLS in the live Supabase project so authenticated users can only create/update/delete requests they participate in (or admin requests).

## Verification
Static smoke test passes. A live authenticated browser test is still required to claim full E2E PASS for Google login, chat, trading, auction, and transaction flows.
