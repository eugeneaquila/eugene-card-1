# Eugene Card — Supabase Phase 3

Project URL: https://kbxqmgdnzxwshyzasssr.supabase.co

This package now uses Supabase JS v2 for browser authentication.

## Required dashboard configuration
1. Enable Google provider in Supabase Auth.
2. Add the deployed site URL to Site URL and Redirect URLs.
3. In Google Cloud, add the Supabase callback URL shown in the provider configuration.

The browser package uses a publishable key only. Never put a service_role key in frontend files.

Phase 4 still needs to replace the remaining Firestore database calls with Supabase table/RPC/Realtime calls.
