/* Eugene Card — Supabase-only auth/profile bootstrap */
(function () {
  const URL = 'https://kbxqmgdnzxwshyzasssr.supabase.co';
  const KEY = 'sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  // BUGFIX (admin recognition): this was 'eugeneaquila06@gmail.com' — missing
  // the dot in "eugene.aquila06" — so it never matched the real admin account
  // used everywhere else in the app (index.html's ADMIN_EMAILS, revenue.html,
  // admin-command-center.html, analytics.html all use the dotted address).
  // Since ensureSupabaseProfile() below uses this to decide whether to write
  // profiles.role = 'admin', and phase8.sql's RLS policies gate real admin
  // reads/writes on `profiles.role = 'admin'`, the mismatch meant the admin
  // account's row in Postgres never actually got marked as admin — the UI
  // could still *show* admin nav (that check lives separately in index.html),
  // but any server-side admin-gated action would be silently denied.
  const ADMIN_EMAILS = ['eugene.aquila06@gmail.com', 'yujinybwork@gmail.com'];
  if (!window.supabase) throw new Error('Supabase SDK missing');

  const sb = window.supabaseClient = window.supabase.createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.isUserAdmin = email => ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
  window.EUGENE_ADMIN_EMAIL = ADMIN_EMAILS[0];

  const normalize = r => r ? ({
    ...r,
    name: r.name ?? r.display_name ?? '',
    display_name: r.display_name ?? r.name ?? '',
    avatarUrl: r.avatarUrl ?? r.avatar_url ?? '',
    isPlusMember: r.isPlusMember ?? r.is_plus_member ?? false,
    socialIg: r.socialIg ?? r.social_ig ?? '',
    socialTwitter: r.socialTwitter ?? r.social_twitter ?? '',
    socialTiktok: r.socialTiktok ?? r.social_tiktok ?? '',
    socialWeb: r.socialWeb ?? r.social_web ?? '',
    profileCompleted: r.profileCompleted ?? r.profile_completed ?? false,
    isAdmin: r.isAdmin ?? r.role === 'admin'
  }) : null;

  async function ensureSupabaseProfile(user) {
    if (!user) return null;
    const email = String(user.email || '').toLowerCase().trim();
    let { data: p } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!p) {
      const { data: legacy } = await sb.from('legacy_profiles').select('*').eq('email', email).maybeSingle();
      const m = legacy || {};
      const name = m.display_name || user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
      const row = {
        id: user.id,
        username: m.username || name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
        display_name: name,
        avatar_url: m.avatar_url || user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(email)}`,
        bio: m.bio || '',
        role: window.isUserAdmin(email) ? 'admin' : 'user',
        is_plus_member: !!m.is_plus_member,
        social_ig: m.social_ig || '',
        social_twitter: m.social_twitter || '',
        social_tiktok: m.social_tiktok || '',
        social_web: m.social_web || '',
        profile_completed: !!m.profile_completed,
        updated_at: new Date().toISOString()
      };
      const created = await sb.from('profiles').upsert(row, { onConflict: 'id' }).select().single();
      p = created.data || row;
    } else if (window.isUserAdmin(email) && p.role !== 'admin') {
      const updated = await sb.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', user.id).select().single();
      p = updated.data || { ...p, role: 'admin' };
    }
    return normalize(p);
  }
  window.ensureSupabaseProfile = ensureSupabaseProfile;

  // BUGFIX (login/logout buttons): this file used to run installVisibleAuth(),
  // which injected its own second Login/Logout button into
  // #auth-header-container on a 50ms poll and re-rendered it on every
  // sb.auth.onAuthStateChange event (after an 80ms delay). index.html's own
  // renderAuthHeader() + handleUserSession()/logoutUser() already fully own
  // that same #auth-header-container element (Google sign-in, admin nav
  // toggling, avatar, username badge, etc). Having two independent renderers
  // fight over one element meant:
  //   - whichever one rendered last (a timing race, not deterministic) won,
  //     so the login/logout button would intermittently flicker or get
  //     replaced by the plain non-admin-aware version from here;
  //   - clicking this version's Logout button called sb.auth.signOut()
  //     directly, skipping logoutUser()'s cleanup (unsubscribing realtime
  //     listeners, resetting currentUser, clearing notification state), and
  //     never re-showed the admin-only nav items being hidden;
  //   - this version's admin check never showed/hid '.admin-only-nav', so an
  //     admin whose button got overwritten by this one would visually lose
  //     Admin Hub / Inventory / Revenue nav access.
  // No other file calls ensureSupabaseProfile/renderSupabaseAuth, so removing
  // the auto-run widget here doesn't affect anything else — the real auth UI
  // continues to work exactly as index.html implements it.
})();
