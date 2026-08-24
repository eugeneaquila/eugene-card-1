/*
 * Eugene Card — Supabase-only compatibility/data layer.
 *
 * The UI keeps its legacy document-shaped calls so the feature set stays
 * identical to the Firebase version, but there is no Firebase SDK or Firebase
 * network call here. Supabase Auth + Postgres are the only backend.
 */
(function () {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('Supabase client is not initialized.');

  const ADMIN_EMAIL = 'eugeneaquila06@gmail.com';
  const tableMap = {
    profiles: 'profiles', cards: 'cards', user_cards: 'user_cards',
    listings: 'listings', transactions: 'transactions',
    tradeRequests: 'trade_requests', trades: 'trades', trade_items: 'trade_items',
    auctions: 'auctions', auction_bids: 'auction_bids',
    system: 'system_state', sell_back_requests: 'sell_back_requests',
    clientGifts: 'client_gifts', chats: 'chats', chat_members: 'chat_members',
    chat_messages: 'chat_messages', notifications: 'notifications', posts: 'posts'
  };
  const uuidTables = new Set([
    'profiles','cards','user_cards','listings','transactions','trades','trade_items',
    'auctions','auction_bids','sell_back_requests','clientGifts','chats',
    'chat_messages','notifications','posts'
  ]);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const isAdminEmail = (email) => String(email || '').toLowerCase().trim() === ADMIN_EMAIL;
  const meta = row => row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const wrap = (row, id) => ({ id: id ?? row?.id, data: () => ({ ...(row || {}) }), exists: !!row });

  function normalizeProfile(row) {
    if (!row) return row;
    return {
      ...row,
      name: row.name ?? row.display_name ?? '',
      display_name: row.display_name ?? row.name ?? '',
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      isPlusMember: row.isPlusMember ?? row.is_plus_member ?? false,
      isAdmin: isAdminEmail(row.email) || row.role === 'admin',
      socialIg: row.socialIg ?? row.social_ig ?? '',
      socialTwitter: row.socialTwitter ?? row.social_twitter ?? '',
      socialTiktok: row.socialTiktok ?? row.social_tiktok ?? '',
      socialWeb: row.socialWeb ?? row.social_web ?? ''
    };
  }

  function normalizeCard(row) {
    if (!row) return row;
    const m = meta(row);
    return {
      ...row, ...m,
      serial: row.serial ?? m.serial ?? m.sn,
      sn: row.sn ?? m.sn,
      price: Number(row.price ?? row.asset_value ?? m.price ?? 0),
      type: row.type ?? m.type ?? 'STANDARD',
      owner: row.owner ?? m.owner ?? null,
      imgUrl: row.imgUrl ?? row.image_url ?? m.imgUrl ?? null,
      status: row.status ?? 'ACTIVE',
      edition: row.edition ?? m.edition,
      tier: row.tier ?? m.tier,
      printing: row.printing ?? m.printing
    };
  }

  function normalize(row, name) {
    if (name === 'profiles') return normalizeProfile(row);
    if (name === 'cards') return normalizeCard(row);
    if (!row) return row;
    return { ...row, ...meta(row) };
  }

  function applyFieldOps(payload, current = {}) {
    const out = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value && value.__op === 'increment') out[key] = Number(current?.[key] || 0) + Number(value.value || 0);
      else if (value && value.__op === 'arrayUnion') out[key] = Array.from(new Set([...(Array.isArray(current?.[key]) ? current[key] : []), ...(value.values || [])]));
      else if (value && value.__op === 'arrayRemove') out[key] = (Array.isArray(current?.[key]) ? current[key] : []).filter(v => !(value.values || []).includes(v));
      else out[key] = value;
    }
    return out;
  }

  async function getAuthUser() {
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data?.user || null;
  }

  async function getRow(name, id) {
    const table = tableMap[name] || name;
    if (name === 'system') {
      const { data, error } = await sb.from(table).select('key,value').eq('key', id).maybeSingle();
      if (error) throw error;
      return data ? { ...data.value, __id: id } : null;
    }
    if (name === 'profiles') {
      if (!UUID_RE.test(String(id))) return null;
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return normalize(data, name);
    }
    if (uuidTables.has(name) && UUID_RE.test(String(id))) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return normalize(data, name);
    }
    const { data, error } = await sb.from(table).select('*').contains('metadata', { legacy_id: id }).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return normalize(data, name);
  }

  async function readCollection(name, filters = [], order = null, limitCount = null) {
    const table = tableMap[name] || name;
    let q = sb.from(table).select('*');
    for (const [field, value] of filters) q = q.eq(field, value);
    if (order) q = q.order(order[0], { ascending: order[1] !== 'desc' });
    if (limitCount) q = q.limit(limitCount);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(r => normalize(r, name));
  }

  function collection(name, filters = [], order = null, limitCount = null) {
    const api = {
      async get() {
        const rows = await readCollection(name, filters, order, limitCount);
        const docs = rows.map(r => wrap(r, r.id));
        return { empty: docs.length === 0, docs, forEach(cb) { docs.forEach(cb); } };
      },
      where(field, op, value) {
        if (op !== '==' && op !== '=') throw new Error('Only equality filters are supported.');
        return collection(name, [...filters, [field, value]], order, limitCount);
      },
      orderBy(field, direction = 'asc') { return collection(name, filters, [field, direction], limitCount); },
      limit(n) { return collection(name, filters, order, n); },
      doc(id) {
        return {
          async get() { return wrap(await getRow(name, id), id); },
          async set(payload, opts = {}) {
            const user = await getAuthUser();
            const existing = await getRow(name, id);
            const merged = opts.merge ? { ...(existing || {}), ...(payload || {}) } : { ...(payload || {}) };
            let row;
            if (name === 'system') {
              const value = opts.merge ? { ...(existing || {}), ...applyFieldOps(payload, existing || {}) } : payload;
              const { error } = await sb.from(tableMap.system).upsert({ key: id, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
              if (error) throw error;
              return;
            }
            if (name === 'profiles') {
              const profileId = user?.id && (id === user.id || id === user.email) ? user.id : id;
              row = {
                id: profileId,
                username: merged.username ?? null,
                display_name: merged.name ?? merged.display_name ?? null,
                avatar_url: merged.avatarUrl ?? merged.avatar_url ?? null,
                bio: merged.bio ?? null,
                role: isAdminEmail(user?.email) ? 'admin' : (merged.role === 'admin' && !isAdminEmail(user?.email) ? 'user' : (merged.role || 'user')),
                is_plus_member: merged.isPlusMember ?? merged.is_plus_member ?? false,
                social_ig: merged.instagram ?? merged.socialIg ?? merged.social_ig ?? '',
                social_twitter: merged.x ?? merged.socialTwitter ?? merged.social_twitter ?? '',
                social_tiktok: merged.tiktok ?? merged.socialTiktok ?? merged.social_tiktok ?? '',
                social_web: merged.website ?? merged.socialWeb ?? merged.social_web ?? '',
                profile_completed: merged.profileCompleted ?? merged.profile_completed ?? true,
                updated_at: new Date().toISOString()
              };
            } else if (name === 'cards') {
              row = {
                id: merged.id || id,
                name: merged.name || 'Eugene Card',
                description: merged.description ?? null,
                image_url: merged.imgUrl ?? merged.image_url ?? null,
                asset_value: Number(merged.price ?? merged.asset_value ?? 0),
                status: merged.status || 'active',
                metadata: {
                  ...meta(existing || {}), ...meta(merged), serial: merged.serial, sn: merged.sn,
                  type: merged.type, edition: merged.edition, tier: merged.tier, printing: merged.printing,
                  owner: merged.owner, imgUrl: merged.imgUrl, price: Number(merged.price ?? merged.asset_value ?? 0),
                  baseFloorPrice: merged.baseFloorPrice
                },
                updated_at: new Date().toISOString()
              };
            } else if (name === 'listings') {
              row = { seller_id: user?.id, user_card_id: merged.cardId || merged.user_card_id, price: Number(merged.price || 0), status: merged.status || 'active', metadata: { ...merged, legacy_id: id }, created_at: merged.created_at || new Date().toISOString() };
              if (UUID_RE.test(String(id))) row.id = id;
            } else if (name === 'transactions') {
              row = { user_id: user?.id, type: merged.type || 'purchase', status: merged.status || 'pending', amount: Number(merged.total_amount ?? merged.amount ?? 0), currency: merged.currency || 'IDR', metadata: { ...merged, legacy_id: id }, created_at: merged.created_at || new Date().toISOString() };
              if (UUID_RE.test(String(id))) row.id = id;
            } else {
              row = { ...merged, id: merged.id || id };
              if (['trades','tradeRequests'].includes(name) && user?.id) row.requester_id = row.requester_id || user.id;
            }
            row = applyFieldOps(row, existing || {});
            const conflict = name === 'system' ? 'key' : 'id';
            const { error } = await sb.from(tableMap[name] || name).upsert(row, { onConflict: conflict });
            if (error) throw error;
          },
          async update(payload) {
            const current = await getRow(name, id);
            if (!current) throw new Error(`Document ${id} not found.`);
            if (name === 'system') return this.set(payload, { merge: true });
            if (name === 'cards') return this.set({ ...current, ...applyFieldOps(payload, current) }, { merge: true });
            const patch = applyFieldOps(payload, current);
            const { error } = await sb.from(tableMap[name] || name).update(patch).eq('id', current.id || id);
            if (error) throw error;
          },
          async delete() {
            const table = tableMap[name] || name;
            if (name === 'system') { const { error } = await sb.from(table).delete().eq('key', id); if (error) throw error; return; }
            const current = await getRow(name, id);
            if (!current?.id) return;
            const { error } = await sb.from(table).delete().eq('id', current.id);
            if (error) throw error;
          },
          collection(child) {
            if (name === 'chats' && child === 'messages') return collection('chat_messages').where('chat_id', '==', id);
            if (name === 'trades' && child === 'items') return collection('trade_items').where('trade_id', '==', id);
            if (name === 'auctions' && child === 'bids') return collection('auction_bids').where('auction_id', '==', id);
            throw new Error('Unsupported nested collection: ' + child);
          }
        };
      },
      onSnapshot(callback) {
        let active = true, last = '';
        const tick = async () => {
          if (!active) return;
          try {
            const snap = await api.get();
            const serial = JSON.stringify(snap.docs.map(d => d.data()));
            if (serial !== last) { last = serial; callback(snap); }
          } catch (e) { console.warn('Supabase realtime read:', e); }
        };
        tick();
        const table = tableMap[name] || name;
        const channel = sb.channel('eugene-' + name + '-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table }, tick).subscribe();
        const timer = setInterval(tick, 10000);
        return () => { active = false; clearInterval(timer); sb.removeChannel(channel); };
      }
    };
    return api;
  }

  const db = {
    collection(name) { return collection(name); },
    batch() {
      const ops = [];
      return {
        set(ref, payload, opts) { ops.push(() => ref.set(payload, opts)); },
        update(ref, payload) { ops.push(() => ref.update(payload)); },
        delete(ref) { ops.push(() => ref.delete()); },
        async commit() { for (const op of ops) await op(); }
      };
    }
  };

  const auth = {
    onAuthStateChanged(callback) {
      sb.auth.getSession().then(({ data }) => callback(data?.session?.user || null));
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPopup() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
    },
    currentUser: null
  };

  const serverTimestamp = () => new Date().toISOString();
  const increment = value => ({ __op: 'increment', value: Number(value) || 0 });
  const arrayUnion = (...values) => ({ __op: 'arrayUnion', values });
  const arrayRemove = (...values) => ({ __op: 'arrayRemove', values });

  // Small compatibility surface for old UI helpers; no Firebase SDK is loaded.
  window.db = db;
  window.auth = auth;
  window.firebase = { firestore: { FieldValue: { serverTimestamp, increment, arrayUnion, arrayRemove } } };
  window.EUGENE_ADMIN_EMAIL = ADMIN_EMAIL;
})();
