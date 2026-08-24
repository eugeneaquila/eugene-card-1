# Eugene Card — Phase 9 Verification

## Static verification
- HTTP serving: PASS
- Supabase JS loaded: PASS
- Firebase SDK/network references: PASS (none in runtime)
- Supabase URL/client configured: PASS
- Legacy Firestore-shaped calls bridged to Supabase: PASS
- Profile email IDs mapped to `auth.users.id`: PASS
- Card/listing/transaction legacy payloads mapped to actual PostgreSQL schema: PASS

## Live verification checklist
Run these against the deployed site with a real Supabase test account:
1. Sign in with Google.
2. Confirm profile loads/creates.
3. Load inventory and collection.
4. Edit a card as admin.
5. Create/delete a listing.
6. Start/end auction.
7. Create/accept/reject trade.
8. Submit QRIS transaction.
9. Approve/reject transaction as admin.
10. Open chat and send/receive a message.
11. Verify realtime updates.
12. Sign out and sign back in.

The package does not claim a live-authenticated pass without executing those actions in a browser session.
