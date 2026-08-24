/* Eugene Card — Supabase client bootstrap */
(function () {
  const SUPABASE_URL = 'https://kbxqmgdnzxwshyzasssr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  const ADMIN_EMAIL = 'eugeneaquila06@gmail.com';
  if (!window.supabase) throw new Error('Supabase JS SDK was not loaded.');
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function toProfile(row) {
    return row ? ({
      ...row,
      name: row.name ?? row.display_name ?? null,
      display_name: row.display_name ?? row.name ?? null,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      isPlusMember: row.isPlusMember ?? row.is_plus_member ?? false,
      socialIg: row.socialIg ?? row.social_ig ?? '',
      socialTwitter: row.socialTwitter ?? row.social_twitter ?? '',
      socialTiktok: row.socialTiktok ?? row.social_tiktok ?? '',
      socialWeb: row.socialWeb ?? row.social_web ?? '',
      profileCompleted: row.profileCompleted ?? row.profile_completed ?? false,
      isAdmin: row.isAdmin ?? row.role === 'admin',
      __legacy: !!row.__legacy
    }) : null;
  }

  function toRow(payload, id, existing) {
    const p = { ...(existing || {}), ...(payload || {}) };
    const role = p.role ?? (p.isAdmin ? 'admin' : (existing?.role || 'user'));
    return {
      id: id || p.id,
      username: p.username ?? null,
      display_name: p.name ?? p.display_name ?? null,
      avatar_url: p.avatarUrl ?? p.avatar_url ?? null,
      bio: p.bio ?? null,
      role,
      is_plus_member: p.isPlusMember ?? p.is_plus_member ?? false,
      social_ig: p.socialIg ?? p.social_ig ?? '',
      social_twitter: p.socialTwitter ?? p.social_twitter ?? '',
      social_tiktok: p.socialTiktok ?? p.social_tiktok ?? '',
      social_web: p.socialWeb ?? p.social_web ?? '',
      profile_completed: p.profileCompleted ?? p.profile_completed ?? false,
      updated_at: new Date().toISOString()
    };
  }

  function installProfileAdapter() {
    if (!window.db || window.db.__profilesAdapterInstalled) return !!window.db;
    const db = window.db;
    const originalCollection = db.collection.bind(db);
    const sb = window.supabaseClient;

    async function readProfiles(filters, order) {
      let q = sb.from('profiles').select('*');
      for (const [field, value] of filters) {
        const column = ({name:'display_name',avatarUrl:'avatar_url',isPlusMember:'is_plus_member',socialIg:'social_ig',socialTwitter:'social_twitter',socialTiktok:'social_tiktok',socialWeb:'social_web',profileCompleted:'profile_completed',isAdmin:'role'}[field] || field);
        q = q.eq(column, field === 'isAdmin' ? (value ? 'admin' : 'user') : value);
      }
      if (order) q = q.order(order[0], { ascending: order[1] !== 'desc' });
      const { data, error } = await q;
      if (error) throw error;
      let lq = sb.from('legacy_profiles').select('*');
      for (const [field, value] of filters) {
        const column = ({name:'display_name',avatarUrl:'avatar_url',isPlusMember:'is_plus_member',socialIg:'social_ig',socialTwitter:'social_twitter',socialTiktok:'social_tiktok',socialWeb:'social_web',profileCompleted:'profile_completed',isAdmin:'role'}[field] || field);
        if (['display_name','avatar_url','is_plus_member','social_ig','social_twitter','social_tiktok','social_web','profile_completed','role','username','bio'].includes(column)) {
          lq = lq.eq(column, field === 'isAdmin' ? (value ? 'admin' : 'user') : value);
        }
      }
      const { data: legacy, error: legacyError } = await lq;
      if (legacyError) console.warn('Legacy profile read:', legacyError);
      const rows = (data || []).map(toProfile);
      const keys = new Set(rows.flatMap(r => [r.id, r.email, r.username].filter(Boolean).map(String).map(s => s.toLowerCase())));
      for (const raw of (legacy || [])) {
        const keySet = [raw.email, raw.username, raw.legacy_id].filter(Boolean).map(String).map(s => s.toLowerCase());
        if (!keySet.some(k => keys.has(k))) rows.push(toProfile({ ...raw, id: raw.legacy_id, __legacy: true }));
      }
      return rows;
    }

    function profileCollection(filters = [], order = null) {
      const api = {
        async get() {
          const rows = await readProfiles(filters, order);
          const docs = rows.map(r => ({ id: r.id, data: () => ({ ...r }), exists: true }));
          return { empty: docs.length === 0, docs, forEach(cb) { docs.forEach(cb); } };
        },
        where(field, op, value) {
          if (op !== '==' && op !== '=') throw new Error('Supabase profile adapter supports equality where() only.');
          return profileCollection([...filters, [field, value]], order);
        },
        orderBy(field, direction = 'asc') { return profileCollection(filters, [field, direction]); },
        doc(id) {
          return {
            async get() {
              const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
              if (error) throw error;
              if (data) return { id, data: () => ({ ...toProfile(data) }), exists: true };
              const { data: legacy, error: legacyError } = await sb.from('legacy_profiles').select('*').or(`legacy_id.eq.${id},email.eq.${id},username.eq.${id}`).maybeSingle();
              if (legacyError) console.warn('Legacy profile lookup:', legacyError);
              const row = legacy ? toProfile({ ...legacy, id: legacy.legacy_id, __legacy: true }) : null;
              return { id, data: () => ({ ...(row || {}) }), exists: !!row };
            },
            async set(payload) {
              const user = (await sb.auth.getUser()).data?.user;
              if (payload?.__legacy) throw new Error('Legacy profiles are read-only.');
              const canonicalId = user && (id === user.email || id === user.id) ? user.id : id;
              const { data: existing, error: readError } = await sb.from('profiles').select('*').eq('id', canonicalId).maybeSingle();
              if (readError) throw readError;
              const row = toRow(payload, canonicalId, existing);
              const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });
              if (error) throw error;
            },
            async update(payload) {
              const { data: existing, error: readError } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
              if (readError) throw readError;
              if (!existing) throw new Error(`Profile ${id} not found.`);
              const row = toRow(payload, id, existing);
              const { error } = await sb.from('profiles').update(row).eq('id', id);
              if (error) throw error;
            },
            async delete() {
              const { error } = await sb.from('profiles').delete().eq('id', id);
              if (error) throw error;
            }
          };
        },
        onSnapshot(callback) {
          let active = true;
          const tick = async () => {
            if (!active) return;
            try { callback(await api.get()); } catch (e) { console.warn('Supabase profile realtime:', e); }
          };
          tick();
          const channel = sb.channel('profiles-adapter-' + Math.random().toString(36).slice(2))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, tick)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_profiles' }, tick)
            .subscribe();
          const timer = setInterval(tick, 15000);
          return () => { active = false; clearInterval(timer); sb.removeChannel(channel); };
        }
      };
      return api;
    }

    db.collection = function(name) { return name === 'profiles' ? profileCollection() : originalCollection(name); };
    db.__profilesAdapterInstalled = true;
    return true;
  }

  function installAuthUiFix() {
    if (!document.body) return false;
    const container = document.getElementById('auth-header-container');
    if (!container) return false;
    if (!document.getElementById('ec-fixed-login-button') && !container.querySelector('button')) {
      const btn = document.createElement('button');
      btn.id = 'ec-fixed-login-button';
      btn.type = 'button';
      btn.className = 'px-3 py-2 bg-white hover:bg-slate-100 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2 border border-slate-200 shadow-lg';
      btn.innerHTML = '<i class="fa-brands fa-google text-red-500"></i><span>Login</span>';
      btn.onclick = async () => {
        try { await window.auth?.signInWithPopup(); }
        catch (e) { console.error(e); alert('Google Login Error: ' + (e?.message || e)); }
      };
      container.appendChild(btn);
    }
    return true;
  }

  function enforceAdminUi() {
    const emailPromise = window.supabaseClient.auth.getUser();
    emailPromise.then(({data}) => {
      const email = String(data?.user?.email || '').toLowerCase().trim();
      const isAdmin = email === ADMIN_EMAIL;
      document.querySelectorAll('.admin-only-nav').forEach(el => el.classList.toggle('hidden', !isAdmin));
      const sep = document.getElementById('admin-nav-separator');
      if (sep) sep.classList.toggle('hidden', !isAdmin);
      const adminStatus = document.getElementById('admin-auth-status');
      if (adminStatus) adminStatus.textContent = isAdmin ? 'ADMIN' : 'COLLECTOR';
    }).catch(() => {});
  }

  const adapterTimer = setInterval(() => { if (installProfileAdapter()) clearInterval(adapterTimer); }, 25);
  const uiTimer = setInterval(() => { installAuthUiFix(); enforceAdminUi(); }, 250);
  document.addEventListener('DOMContentLoaded', () => { installAuthUiFix(); enforceAdminUi(); });
})();
