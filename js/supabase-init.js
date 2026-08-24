/* Eugene Card — Supabase client bootstrap */
(function () {
  const SUPABASE_URL = 'https://kbxqmgdnzxwshyzasssr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  if (!window.supabase) throw new Error('Supabase JS SDK was not loaded.');
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
