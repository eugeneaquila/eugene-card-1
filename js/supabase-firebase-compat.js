/* Eugene Card Phase 9 compatibility bridge.
 * No Firebase SDK is loaded or contacted. Legacy Firestore-shaped calls are
 * translated into the actual Supabase schema so the existing UI can run while
 * the app is fully cut over.
 */
(function () {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('supabaseClient missing');

  const tableMap = {
    profiles: 'profiles', cards: 'cards', user_cards: 'user_cards', listings: 'listings',
    transactions: 'transactions', tradeRequests: 'trade_requests', system: 'system_state',
    sell_back_requests: 'sell_back_requests', chats: 'chats', chat_messages: 'chat_messages',
    notifications: 'notifications', posts: 'posts'
  };

  const uuidTables = new Set(['profiles','cards','user_cards','listings','transactions','chats','chat_messages','notifications','posts','sell_back_requests']);

  function wrap(row, id) {
    return { id: id ?? row?.id, data: () => ({ ...(row || {}) }), exists: !!row };
  }

  function meta(row) { return (row && row.metadata && typeof row.metadata === 'object') ? row.metadata : {}; }

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

  function normalizeListing(row) {
    if (!row) return row;
    const m = meta(row);
    return { ...row, ...m, id: m.legacy_id ?? row.id, cardId: m.cardId ?? row.user_card_id, seller: m.seller ?? m.owner ?? null,
      serial: m.serial, name: m.name, type: m.type, imgUrl: m.imgUrl ?? m.image_url, price: Number(row.price ?? m.price ?? 0) };
  }

  function normalizeTransaction(row) {
    if (!row) return row;
    const m = meta(row);
    return { ...row, ...m, id: m.legacy_id ?? row.id, user_name: m.user_name, items: m.items || [], total_amount: Number(m.total_amount ?? row.amount ?? 0), qrisProofUrl: m.qrisProofUrl };
  }

  function normalizeProfile(row) {
    if (!row) return row;
    return { ...row, name: row.name ?? row.display_name, isPlusMember: row.isPlusMember ?? false, isAdmin: row.isAdmin ?? row.role === 'admin' };
  }

  async function currentUser() { const { data } = await sb.auth.getUser(); return data?.user || null; }

  async function resolveLegacyRow(name, id) {
    const table = tableMap[name] || name;
    if (name === 'system') {
      const { data, error } = await sb.from(table).select('value').eq('key', id).maybeSingle();
      if (error) throw error; return data ? { ...data.value, __id: id } : null;
    }
    if (name === 'profiles') {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (data) return normalizeProfile(data);
      const { data: byEmail, error: emailError } = await sb.from(table).select('*').eq('email', id).maybeSingle();
      if (emailError && emailError.code !== 'PGRST116') throw emailError;
      return normalizeProfile(byEmail);
    }
    if (uuidTables.has(name) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
      const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error; return name === 'cards' ? normalizeCard(data) : name === 'listings' ? normalizeListing(data) : name === 'transactions' ? normalizeTransaction(data) : data;
    }
    const { data, error } = await sb.from(table).select('*').contains('metadata', { legacy_id: id }).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return name === 'listings' ? normalizeListing(data) : name === 'transactions' ? normalizeTransaction(data) : data;
  }

  async function readCollection(name, query) {
    const table = tableMap[name] || name;
    let q = sb.from(table).select('*');
    if (query?.filters) for (const f of query.filters) q = q.eq(f[0], f[1]);
    if (query?.order) q = q.order(query.order[0], { ascending: query.order[1] !== 'desc' });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(r => name === 'cards' ? normalizeCard(r) : name === 'profiles' ? normalizeProfile(r) : name === 'listings' ? normalizeListing(r) : name === 'transactions' ? normalizeTransaction(r) : r);
  }

  function collection(name, baseFilters = [], order = null) {
    const api = {
      async get() {
        const rows = await readCollection(name, { filters: baseFilters, order });
        return { empty: rows.length === 0, docs: rows.map(r => wrap(r, r.id)) };
      },
      where(field, op, value) {
        if (op !== '==' && op !== '=') throw new Error('Phase 9 bridge supports equality where() only.');
        return collection(name, [...baseFilters, [field, value]], order);
      },
      orderBy(field, direction = 'asc') { return collection(name, baseFilters, [field, direction]); },
      doc(id) {
        return {
          async get() { return wrap(await resolveLegacyRow(name, id), id); },
          async set(payload, opts = {}) {
            const table = tableMap[name] || name;
            if (name === 'system') {
              const current = await resolveLegacyRow(name, id) || {};
              const value = opts.merge ? { ...current, ...payload } : payload;
              const { error } = await sb.from(table).upsert({ key: id, value, updated_at: new Date().toISOString() });
              if (error) throw error; return;
            }
            const user = await currentUser();
            let row = { ...payload };
            if (name === 'profiles') {
              const profileId = user?.id && (id === user.email || id === user.id) ? user.id : id;
              row = { display_name: payload.name ?? payload.display_name, username: payload.username, avatar_url: payload.avatarUrl ?? payload.avatar_url, bio: payload.bio, role: payload.role ?? (payload.isAdmin ? 'admin' : 'user'), id: profileId };
              Object.keys(row).forEach(k => row[k] === undefined ? delete row[k] : null);
            } else if (name === 'cards') {
              const m = { ...meta(payload), serial: payload.serial, sn: payload.sn, type: payload.type, edition: payload.edition, tier: payload.tier, printing: payload.printing, owner: payload.owner, imgUrl: payload.imgUrl };
              row = { id: payload.id || id, name: payload.name || 'Eugene Card', description: payload.description ?? null, image_url: payload.imgUrl ?? payload.image_url ?? null, asset_value: Number(payload.price ?? payload.asset_value ?? 0), status: payload.status || 'ACTIVE', metadata: m, updated_at: new Date().toISOString() };
            } else if (name === 'listings') {
              row = { seller_id: user?.id, user_card_id: payload.cardId || payload.user_card_id, price: Number(payload.price || 0), status: payload.status || 'ACTIVE', metadata: { ...payload, legacy_id: id }, created_at: payload.created_at || new Date().toISOString() };
              if (/^[0-9a-f-]{36}$/i.test(id)) row.id = id;
            } else if (name === 'transactions') {
              row = { user_id: user?.id, type: payload.type || 'QRIS_ORDER', status: payload.status || 'PENDING', amount: Number(payload.total_amount ?? payload.amount ?? 0), currency: payload.currency || 'IDR', metadata: { ...payload, legacy_id: id }, created_at: payload.created_at || new Date().toISOString() };
              if (/^[0-9a-f-]{36}$/i.test(id)) row.id = id;
            } else if (name === 'tradeRequests') {
              row = { ...payload, id };
            } else {
              row = { ...payload, id };
            }
            const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
            if (error) throw error;
          },
          async update(payload) {
            const table = tableMap[name] || name;
            if (name === 'system') return this.set(payload, { merge: true });
            const current = await resolveLegacyRow(name, id);
            if (!current) throw new Error(`Document ${id} not found in ${table}`);
            if (name === 'cards') {
              const merged = normalizeCard({ ...current, ...payload });
              return this.set(merged, { merge: true });
            }
            if (name === 'transactions' || name === 'listings') {
              const { error } = await sb.from(table).update({ status: payload.status, updated_at: new Date().toISOString(), ...(name === 'transactions' ? { metadata: { ...meta(current), ...payload } } : {}) }).eq('id', current.id);
              if (error) throw error; return;
            }
            const targetId = current.id || id;
            const { error } = await sb.from(table).update(payload).eq('id', targetId);
            if (error) throw error;
          },
          async delete() {
            const table = tableMap[name] || name;
            if (name === 'system') { const { error } = await sb.from(table).delete().eq('key', id); if (error) throw error; return; }
            const current = await resolveLegacyRow(name, id);
            if (!current?.id) return;
            const { error } = await sb.from(table).delete().eq('id', current.id);
            if (error) throw error;
          },
          collection(child) {
            if (name === 'chats' && child === 'messages') return collection('chat_messages').where('chat_id', '==', id);
            throw new Error('Unsupported nested collection: ' + child);
          }
        };
      },
      onSnapshot(callback) {
        let active = true, last = '';
        const tick = async () => { if (!active) return; try { const snap = await api.get(); const serial = JSON.stringify(snap.docs.map(d => d.data())); if (serial !== last) { last = serial; callback(snap); } } catch (e) { console.warn('Supabase realtime bridge:', e); } };
        tick();
        const table = tableMap[name] || name;
        const channel = sb.channel('phase9-' + name + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table }, tick).subscribe();
        const timer = setInterval(tick, 15000);
        return () => { active = false; clearInterval(timer); sb.removeChannel(channel); };
      }
    };
    return api;
  }

  const db = { collection, batch() { const ops=[]; return { set(ref,payload,opts){ops.push(()=>ref.set(payload,opts));}, update(ref,payload){ops.push(()=>ref.update(payload));}, delete(ref){ops.push(()=>ref.delete());}, async commit(){for(const op of ops) await op();} }; } };
  const auth = {
    onAuthStateChanged(cb) { sb.auth.getUser().then(({data})=>cb(data?.user||null)); const {data}=sb.auth.onAuthStateChange((_e,s)=>cb(s?.user||null)); return ()=>data.subscription.unsubscribe(); },
    async signInWithPopup() { const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}}); if(error) throw error; },
    async signOut() { const {error}=await sb.auth.signOut(); if(error) throw error; }
  };
  window.db=db; window.auth=auth; window.analytics=null; window.firebase=undefined;
})();
