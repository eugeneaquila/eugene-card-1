/* Eugene Card Phase 8 compatibility bridge.
 * Keeps the existing UI stable while all persistence/auth is Supabase.
 * No Firebase SDK is loaded or contacted.
 */
(function () {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('supabaseClient missing');

  const tableMap = {
    profiles: 'profiles', cards: 'cards', user_cards: 'user_cards', listings: 'listings',
    transactions: 'transactions', tradeRequests: 'trade_requests', system: 'system_state',
    sell_back_requests: 'sell_back_requests', chats: 'chats', notifications: 'notifications',
    posts: 'posts'
  };

  function wrap(row, id) {
    return { id: id ?? row?.id, data: () => ({ ...(row || {}) }), exists: !!row };
  }

  function normalizeCard(row) {
    if (!row) return row;
    return {
      ...row,
      serial: row.serial ?? row.metadata?.serial ?? row.metadata?.sn,
      price: Number(row.price ?? row.asset_value ?? row.metadata?.price ?? 0),
      type: row.type ?? row.metadata?.type ?? 'STANDARD',
      owner: row.owner ?? row.metadata?.owner,
      status: row.status ?? 'ACTIVE'
    };
  }

  async function readCollection(name, query) {
    const table = tableMap[name] || name;
    let q = sb.from(table).select('*');
    if (query?.filters) for (const f of query.filters) q = q.eq(f[0], f[1]);
    if (query?.order) q = q.order(query.order[0], { ascending: query.order[1] !== 'desc' });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(r => name === 'cards' ? normalizeCard(r) : r);
  }

  function collection(name, baseFilters = [], order = null) {
    const api = {
      async get() {
        const rows = await readCollection(name, { filters: baseFilters, order });
        return { empty: rows.length === 0, docs: rows.map(r => wrap(r, r.id)) };
      },
      where(field, op, value) {
        if (op !== '==' && op !== '=') throw new Error('Phase 8 bridge supports equality where() only.');
        return collection(name, [...baseFilters, [field, value]], order);
      },
      orderBy(field, direction = 'asc') { return collection(name, baseFilters, [field, direction]); },
      doc(id) {
        return {
          async get() {
            const table = tableMap[name] || name;
            if (name === 'system') {
              const { data, error } = await sb.from(table).select('value').eq('key', id).maybeSingle();
              if (error) throw error;
              return wrap(data?.value ?? null, id);
            }
            const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            return wrap(name === 'cards' ? normalizeCard(data) : data, id);
          },
          async set(payload, opts = {}) {
            const table = tableMap[name] || name;
            if (name === 'system') {
              const value = opts.merge ? { ...(await this.get()).data(), ...payload } : payload;
              const { error } = await sb.from(table).upsert({ key: id, value, updated_at: new Date().toISOString() });
              if (error) throw error; return;
            }
            const row = { ...payload, id };
            const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
            if (error) throw error;
          },
          async update(payload) {
            const table = tableMap[name] || name;
            const { error } = await sb.from(table).update(payload).eq('id', id);
            if (error) throw error;
          },
          async delete() {
            const table = tableMap[name] || name;
            const { error } = await sb.from(table).delete().eq(name === 'system' ? 'key' : 'id', id);
            if (error) throw error;
          },
          collection(child) {
            if (name === 'chats' && child === 'messages') {
              return collection('chat_messages').where('chat_id', '==', id);
            }
            throw new Error('Unsupported nested collection: ' + child);
          }
        };
      },
      onSnapshot(callback) {
        let active = true;
        let last = '';
        const tick = async () => {
          if (!active) return;
          try {
            const snap = await api.get();
            const serial = JSON.stringify(snap.docs.map(d => d.data()));
            if (serial !== last) { last = serial; callback(snap); }
          } catch (e) { console.warn('Supabase realtime bridge:', e); }
        };
        tick();
        const table = tableMap[name] || name;
        const channel = sb.channel('phase8-' + name + '-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table }, tick)
          .subscribe();
        const timer = setInterval(tick, 15000);
        return () => { active = false; clearInterval(timer); sb.removeChannel(channel); };
      }
    };
    return api;
  }

  const db = {
    collection,
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
    onAuthStateChanged(cb) {
      sb.auth.getUser().then(({ data }) => cb(data?.user || null));
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user || null));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPopup() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw error;
    },
    async signOut() { const { error } = await sb.auth.signOut(); if (error) throw error; }
  };

  window.db = db;
  window.auth = auth;
  window.analytics = null;
  window.firebase = undefined;
})();
