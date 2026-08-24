# Eugene Card — Phase 8 Firebase → Supabase Cutover

This package removes the Firebase runtime from the current Eugene Card frontend and supplies a Supabase compatibility bridge so the existing UI can continue using its legacy `db.collection(...)` calls while persistence/auth are handled by Supabase.

## Included
- `index(9).html` — Firebase-free frontend cutover
- `js/supabase-init.js` — Supabase client bootstrap
- `js/supabase-firebase-compat.js` — temporary Firestore-shaped compatibility bridge backed by Supabase
- `phase8.sql` — additive Supabase tables/policies/indexes for remaining legacy concepts

## Important
The compatibility bridge is intentionally transitional. It is not the final cleanup of every legacy function name. It prevents the old UI from calling Firebase while allowing the app to be tested against Supabase.

Before production, test:
1. Google login/logout
2. Cards and ownership
3. Listings
4. Trade requests
5. Auction
6. QRIS transactions/admin approval
7. Chat/inbox
8. Notifications
9. Sell-back
10. Realtime updates

Do not delete the Firebase project until these flows have been verified in production.
