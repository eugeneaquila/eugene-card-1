# Eugene Card — Phase 4

This package routes the legacy Firebase collection API through a Supabase compatibility adapter so the existing UI now reads/writes Supabase Phase 2 tables.

## Mapping
users/profiles -> profiles
cards -> cards
transactions -> transactions
listings -> listings
tradeRequests -> trades
clientGifts -> client_gifts
posts -> posts
notifications -> notifications
cardViews -> card_views

Realtime listeners are implemented with Supabase Postgres Changes. Chat subcollections, auction state, and complex batch trade/payment operations remain targeted for native RPC conversion because their Firebase document shape does not map 1:1 to the Phase 2 relational schema.

Before production, enable the relevant tables in the supabase_realtime publication and complete Google OAuth redirect configuration.
