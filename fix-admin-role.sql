-- One-time repair for the admin-recognition bug.
--
-- js/supabase-init.js and js/supabase-firebase-compat.js compared the logged-in
-- email against 'eugeneaquila06@gmail.com' (missing the dot in "eugene.aquila06"),
-- so profiles.role was never set to 'admin' for the real admin account(s), even
-- though the app's RLS policies (see phase8.sql) require role='admin' for admin
-- actions. That code is now fixed going forward, but any profile row created
-- *before* the fix is still stuck with role='user' and won't self-correct on a
-- normal login. Run this once in the Supabase SQL editor to repair it:

-- profiles.id references auth.users(id) and this table has no email column
-- of its own, so join through auth.users to find the admin account(s).
update public.profiles p
set role = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) in ('eugene.aquila06@gmail.com', 'yujinybwork@gmail.com')
  and p.role is distinct from 'admin';

-- Sanity check afterwards:
-- select p.id, u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
