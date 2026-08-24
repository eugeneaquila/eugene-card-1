/* Eugene Card — Supabase bootstrap, profile adapter, auth/UI repair */
(function () {
  const SUPABASE_URL = 'https://kbxqmgdnzxwshyzasssr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  const ADMIN_EMAIL = 'eugeneaquila06@gmail.com';
  if (!window.supabase) throw new Error('Supabase JS SDK was not loaded.');
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const toProfile = row => row ? ({
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

  function toRow(payload, id, existing) {
    const p = { ...(existing || {}), ...(payload || {}) };
    const role = String(p.role || (p.isAdmin ? 'admin' : (existing?.role || 'user'))).toLowerCase() === 'admin' ? 'admin' : 'user';
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
    const db = window.db, originalCollection = db.collection.bind(db), sb = window.supabaseClient;

    async function readProfiles(filters = [], order = null) {
      let q = sb.from('profiles').select('*');
      for (const [field, value] of filters) {
        const col = ({name:'display_name',avatarUrl:'avatar_url',isPlusMember:'is_plus_member',socialIg:'social_ig',socialTwitter:'social_twitter',socialTiktok:'social_tiktok',socialWeb:'social_web',profileCompleted:'profile_completed',isAdmin:'role'}[field] || field);
        q = q.eq(col, field === 'isAdmin' ? (value ? 'admin' : 'user') : value);
      }
      if (order) q = q.order(order[0], { ascending: order[1] !== 'desc' });
      const { data, error } = await q;
      if (error) throw error;

      let legacy = [];
      try {
        let lq = sb.from('legacy_profiles').select('*');
        for (const [field, value] of filters) {
          const col = ({name:'display_name',avatarUrl:'avatar_url',isPlusMember:'is_plus_member',socialIg:'social_ig',socialTwitter:'social_twitter',socialTiktok:'social_tiktok',socialWeb:'social_web',profileCompleted:'profile_completed',isAdmin:'role'}[field] || field);
          if (['display_name','avatar_url','is_plus_member','social_ig','social_twitter','social_tiktok','social_web','profile_completed','role','username','bio'].includes(col)) lq = lq.eq(col, field === 'isAdmin' ? (value ? 'admin' : 'user') : value);
        }
        const lr = await lq;
        if (!lr.error) legacy = lr.data || [];
      } catch (e) { console.warn('Legacy profile read:', e); }

      const rows = (data || []).map(toProfile);
      const keys = new Set(rows.flatMap(r => [r.id,r.email,r.username].filter(Boolean).map(v => String(v).toLowerCase())));
      for (const raw of legacy) {
        const ks = [raw.email,raw.username,raw.legacy_id].filter(Boolean).map(v => String(v).toLowerCase());
        if (!ks.some(k => keys.has(k))) rows.push(toProfile({...raw,id:raw.legacy_id,__legacy:true}));
      }
      return rows;
    }

    function profileCollection(filters = [], order = null) {
      const api = {
        async get() {
          const rows = await readProfiles(filters, order);
          const docs = rows.map(r => ({ id:r.id, data:()=>({...r}), exists:true }));
          return { empty:docs.length===0, docs, forEach:cb=>docs.forEach(cb) };
        },
        where(field, op, value) {
          if (op !== '==' && op !== '=') throw new Error('Supabase profile adapter supports equality where() only.');
          return profileCollection([...filters,[field,value]],order);
        },
        orderBy(field,direction='asc') { return profileCollection(filters,[field,direction]); },
        doc(id) {
          return {
            async get() {
              const user = (await sb.auth.getUser()).data?.user;
              const candidates = [id];
              if (user && String(id).toLowerCase() === String(user.email||'').toLowerCase()) candidates.unshift(user.id);
              let data = null;
              for (const candidate of [...new Set(candidates)]) {
                const r = await sb.from('profiles').select('*').eq('id',candidate).maybeSingle();
                if (r.error) throw r.error;
                if (r.data) { data = r.data; break; }
              }
              if (data) return {id:data.id,data:()=>({...toProfile(data)}),exists:true};
              const {data:legacy,error} = await sb.from('legacy_profiles').select('*').or(`legacy_id.eq.${id},email.eq.${id},username.eq.${id}`).maybeSingle();
              if (error) console.warn('Legacy profile lookup:',error);
              const row = legacy ? toProfile({...legacy,id:legacy.legacy_id,__legacy:true}) : null;
              return {id,data:()=>({...row||{}}),exists:!!row};
            },
            async set(payload, opts={}) {
              if (payload?.__legacy) throw new Error('Legacy profiles are read-only.');
              const user = (await sb.auth.getUser()).data?.user;
              const canonicalId = user && (String(id).toLowerCase()===String(user.email||'').toLowerCase() || id===user.id) ? user.id : id;
              const {data:existing,error:readError} = await sb.from('profiles').select('*').eq('id',canonicalId).maybeSingle();
              if (readError) throw readError;
              const row = toRow(payload,canonicalId,existing);
              if (canonicalId === user?.id && String(user.email||'').toLowerCase() === ADMIN_EMAIL) row.role='admin';
              const {error} = await sb.from('profiles').upsert(row,{onConflict:'id'});
              if (error) throw error;
            },
            async update(payload) {
              const {data:existing,error:readError}=await sb.from('profiles').select('*').eq('id',id).maybeSingle();
              if(readError) throw readError;
              if(!existing) throw new Error(`Profile ${id} not found.`);
              const row=toRow(payload,id,existing);
              const {error}=await sb.from('profiles').update(row).eq('id',id);
              if(error) throw error;
            },
            async delete() { const {error}=await sb.from('profiles').delete().eq('id',id); if(error) throw error; }
          };
        },
        onSnapshot(callback) {
          let active=true;
          const tick=async()=>{if(!active)return;try{callback(await api.get());}catch(e){console.warn('Supabase profile realtime:',e);}};
          tick();
          const channel=sb.channel('profiles-adapter-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},tick).on('postgres_changes',{event:'*',schema:'public',table:'legacy_profiles'},tick).subscribe();
          const timer=setInterval(tick,15000);
          return()=>{active=false;clearInterval(timer);sb.removeChannel(channel);};
        }
      };
      return api;
    }
    db.collection=name=>name==='profiles'?profileCollection():originalCollection(name);
    db.__profilesAdapterInstalled=true;
    return true;
  }

  // Hard guarantee: the application can never grant admin based on a profile name.
  window.isUserAdmin = function(identifier) {
    return String(identifier||'').trim().toLowerCase() === ADMIN_EMAIL;
  };

  // The legacy page already has handleUserSession(), but its old Firebase listener
  // can miss the Supabase OAuth return in some browser states. Re-run the session
  // hydration whenever Supabase reports a session, then force the visible UI refresh.
  let hydrating=false, lastHydratedUid='';
  async function hydrateAppSession(user) {
    if (!user?.id || hydrating) return;
    if (lastHydratedUid===user.id && typeof window.renderAuthHeader==='function') {
      try { window.renderAuthHeader(); } catch (_) {}
      return;
    }
    if (typeof window.handleUserSession !== 'function') return;
    hydrating=true;
    try {
      await window.handleUserSession(user);
      lastHydratedUid=user.id;
      if (typeof window.renderAuthHeader==='function') window.renderAuthHeader();
      if (typeof window.updateAllViews==='function') window.updateAllViews();
    } catch(e) {
      console.error('Eugene Card Supabase session hydration failed:',e);
      // Still expose a usable login state if the legacy profile renderer failed.
      try { if (typeof window.renderAuthHeader==='function') window.renderAuthHeader(); } catch (_) {}
    } finally { hydrating=false; }
  }

  function installAuthRepair() {
    const run=async()=>{
      const {data,error}=await window.supabaseClient.auth.getUser();
      if(error){console.warn('Supabase session:',error);return;}
      if(data?.user) await hydrateAppSession(data.user);
      else if(typeof window.renderAuthHeader==='function') window.renderAuthHeader();
    };
    window.supabaseClient.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){lastHydratedUid='';try{window.currentUser=null;}catch(_){} if(typeof window.renderAuthHeader==='function') window.renderAuthHeader();return;}
      if(session?.user) setTimeout(()=>hydrateAppSession(session.user),0);
    });
    run();
  }

  const adapterTimer=setInterval(()=>{if(installProfileAdapter())clearInterval(adapterTimer);},25);
  const repairTimer=setInterval(()=>{
    if(typeof window.handleUserSession==='function' && typeof window.renderAuthHeader==='function'){
      clearInterval(repairTimer); installAuthRepair();
    }
  },50);
})();
