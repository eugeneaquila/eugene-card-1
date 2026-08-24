/* Eugene Card — Supabase-only auth/profile bootstrap */
(function () {
  const URL = 'https://kbxqmgdnzxwshyzasssr.supabase.co';
  const KEY = 'sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  const ADMIN = 'eugeneaquila06@gmail.com';
  if (!window.supabase) throw new Error('Supabase SDK missing');

  const sb = window.supabaseClient = window.supabase.createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.isUserAdmin = email => String(email || '').trim().toLowerCase() === ADMIN;
  window.EUGENE_ADMIN_EMAIL = ADMIN;

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

  function installVisibleAuth() {
    if (!document.body) return false;
    let box = document.getElementById('auth-header-container');
    if (!box) {
      box = document.getElementById('ec-auth-fixed');
      if (!box) {
        box = document.createElement('div');
        box.id = 'ec-auth-fixed';
        const header = document.querySelector('header');
        (header?.querySelector('.max-w-7xl') || header || document.body).appendChild(box);
      }
    }
    if (!document.getElementById('ec-auth-style')) {
      const style = document.createElement('style');
      style.id = 'ec-auth-style';
      style.textContent = `
        #auth-header-container,#ec-auth-fixed{display:flex!important;align-items:center;gap:8px;min-width:fit-content}
        #auth-header-container .ec-login,#ec-auth-fixed .ec-login{border:1px solid rgba(99,102,241,.55);background:#4f46e5;color:#fff;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
        #auth-header-container .ec-user,#ec-auth-fixed .ec-user{display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.12);background:#111827;color:#fff;border-radius:10px;padding:5px 8px;white-space:nowrap}
        #auth-header-container .ec-user img,#ec-auth-fixed .ec-user img{width:28px;height:28px;border-radius:50%;object-fit:cover}
        #auth-header-container .ec-logout,#ec-auth-fixed .ec-logout{border:1px solid rgba(244,63,94,.3);background:#111827;color:#fb7185;border-radius:9px;padding:7px 9px;font-weight:800;cursor:pointer}
      `;
      document.head.appendChild(style);
    }
    async function render() {
      const { data } = await sb.auth.getUser();
      const user = data?.user;
      box.innerHTML = '';
      if (!user) {
        const login = document.createElement('button');
        login.className = 'ec-login';
        login.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login';
        login.onclick = async () => {
          const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
          if (error) alert(error.message);
        };
        box.appendChild(login);
        return;
      }
      const profile = await ensureSupabaseProfile(user);
      const userBox = document.createElement('div');
      userBox.className = 'ec-user';
      userBox.innerHTML = `<img src="${profile?.avatarUrl || user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user.email || ''))}`}" alt=""><span>${profile?.display_name || user.email || 'Profile'}</span>`;
      userBox.title = profile?.isAdmin ? 'Admin profile' : 'Open profile';
      userBox.onclick = () => {
        if (typeof window.openProfileModal === 'function') window.openProfileModal();
        else if (typeof window.openProfile === 'function') window.openProfile();
      };
      box.appendChild(userBox);
      const logout = document.createElement('button');
      logout.className = 'ec-logout';
      logout.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
      logout.onclick = async () => { await sb.auth.signOut(); render(); };
      box.appendChild(logout);
    }
    window.renderSupabaseAuth = render;
    render();
    sb.auth.onAuthStateChange((event) => {
      if (['SIGNED_IN','SIGNED_OUT','USER_UPDATED','INITIAL_SESSION'].includes(event)) setTimeout(render, 80);
    });
    return true;
  }

  const timer = setInterval(() => { if (installVisibleAuth()) clearInterval(timer); }, 50);
})();
