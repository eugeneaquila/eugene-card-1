/* Eugene Card — Supabase auth + profile bridge */
(function(){
  const URL='https://kbxqmgdnzxwshyzasssr.supabase.co';
  const KEY='sb_publishable__tPM9ty9ELyh3X70Hl1S-Q_7hWvPe2R';
  const ADMIN='eugeneaquila06@gmail.com';
  if(!window.supabase) return console.error('Supabase SDK missing');
  const sb=window.supabaseClient=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.isUserAdmin=e=>String(e||'').trim().toLowerCase()===ADMIN;

  const profile=(r)=>r?({...r,name:r.name??r.display_name??'',display_name:r.display_name??r.name??'',avatarUrl:r.avatarUrl??r.avatar_url??'',isPlusMember:r.isPlusMember??r.is_plus_member??false,socialIg:r.socialIg??r.social_ig??'',socialTwitter:r.socialTwitter??r.social_twitter??'',socialTiktok:r.socialTiktok??r.social_tiktok??'',socialWeb:r.socialWeb??r.social_web??'',profileCompleted:r.profileCompleted??r.profile_completed??false,isAdmin:r.isAdmin??r.role==='admin'}):null;

  async function ensureProfile(user){
    if(!user) return null;
    const {data:p}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(p) return profile(p);
    const {data:legacy}=await sb.from('legacy_profiles').select('*').eq('email',String(user.email||'').toLowerCase()).maybeSingle();
    const m=legacy||{};
    const row={id:user.id,username:m.username||null,display_name:m.display_name||user.user_metadata?.full_name||user.user_metadata?.name||String(user.email||'').split('@')[0],avatar_url:m.avatar_url||user.user_metadata?.avatar_url||null,bio:m.bio||null,role:window.isUserAdmin(user.email)?'admin':'user',is_plus_member:!!m.is_plus_member,social_ig:m.social_ig||'',social_twitter:m.social_twitter||'',social_tiktok:m.social_tiktok||'',social_web:m.social_web||'',profile_completed:!!m.profile_completed,updated_at:new Date().toISOString()};
    const {data:created,error}=await sb.from('profiles').upsert(row,{onConflict:'id'}).select().single();
    if(error){console.error('Profile create failed',error);return profile(row)}
    return profile(created);
  }
  window.ensureSupabaseProfile=ensureProfile;

  function installProfileBridge(){
    if(!window.db||window.db.__supabaseProfiles) return !!window.db;
    const db=window.db, original=db.collection.bind(db);
    const mapField=f=>({name:'display_name',avatarUrl:'avatar_url',isPlusMember:'is_plus_member',socialIg:'social_ig',socialTwitter:'social_twitter',socialTiktok:'social_tiktok',socialWeb:'social_web',profileCompleted:'profile_completed',isAdmin:'role'}[f]||f);
    const rows=async(filters=[],order)=>{
      let q=sb.from('profiles').select('*');
      for(const [f,v] of filters) q=q.eq(mapField(f),f==='isAdmin'?(v?'admin':'user'):v);
      if(order) q=q.order(mapField(order[0]),{ascending:order[1]!=='desc'});
      const a=await q;if(a.error)throw a.error;
      let legacy=[];try{const l=await sb.from('legacy_profiles').select('*');if(!l.error)legacy=l.data||[]}catch(e){}
      const out=(a.data||[]).map(profile), keys=new Set(out.flatMap(x=>[x.id,x.email,x.username].filter(Boolean).map(String).map(x=>x.toLowerCase())));
      legacy.forEach(x=>{const ks=[x.email,x.username,x.legacy_id].filter(Boolean).map(String).map(x=>x.toLowerCase());if(!ks.some(k=>keys.has(k)))out.push(profile({...x,id:x.legacy_id,__legacy:true}))});
      return out;
    };
    function coll(filters=[],order){
      return {async get(){const r=await rows(filters,order),docs=r.map(x=>({id:x.id,data:()=>({...x}),exists:true}));return{empty:!docs.length,docs,forEach:f=>docs.forEach(f)}},where(f,o,v){return coll([...filters,[f,v]],order)},orderBy(f,d='asc'){return coll(filters,[f,d])},doc(id){return{async get(){const u=(await sb.auth.getUser()).data?.user;let qid=id;if(u&&String(id).toLowerCase()===String(u.email||'').toLowerCase())qid=u.id;let r=await sb.from('profiles').select('*').eq('id',qid).maybeSingle();if(r.error)throw r.error;if(r.data)return{id:r.data.id,data:()=>({...profile(r.data)}),exists:true};let l=await sb.from('legacy_profiles').select('*').or(`legacy_id.eq.${id},email.eq.${id},username.eq.${id}`).maybeSingle();const x=l.data?profile({...l.data,id:l.data.legacy_id,__legacy:true}):null;return{id,data:()=>({...x||{}}),exists:!!x}},async set(p){const u=(await sb.auth.getUser()).data?.user;if(!u)throw Error('Not authenticated');const row={id:u.id,username:p.username??null,display_name:p.name??p.display_name??null,avatar_url:p.avatarUrl??p.avatar_url??null,bio:p.bio??null,role:window.isUserAdmin(u.email)?'admin':(p.role==='admin'?'user':(p.role||'user')),is_plus_member:p.isPlusMember??p.is_plus_member??false,social_ig:p.socialIg??p.social_ig??'',social_twitter:p.socialTwitter??p.social_twitter??'',social_tiktok:p.socialTiktok??p.social_tiktok??'',social_web:p.socialWeb??p.social_web??'',profile_completed:p.profileCompleted??p.profile_completed??false,updated_at:new Date().toISOString()};const r=await sb.from('profiles').upsert(row,{onConflict:'id'});if(r.error)throw r.error},async update(p){const r=await this.set(p);return r},async delete(){const u=(await sb.auth.getUser()).data?.user;if(!u)throw Error('Not authenticated');if(u.id!==id&&!window.isUserAdmin(u.email))throw Error('Not allowed');const r=await sb.from('profiles').delete().eq('id',id);if(r.error)throw r.error}}},onSnapshot(cb){let live=true;const tick=()=>{if(live)rows(filters,order).then(r=>cb({empty:!r.length,docs:r.map(x=>({id:x.id,data:()=>({...x}),exists:true})),forEach:f=>r.forEach(x=>f({id:x.id,data:()=>({...x}),exists:true}))})).catch(console.warn)};tick();const c=sb.channel('profiles-ui').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},tick).subscribe();return()=>{live=false;sb.removeChannel(c)}}};
    }
    db.collection=n=>n==='profiles'?coll():original(n);db.__supabaseProfiles=true;return true;
  }

  function installVisibleAuth(){
    if(document.getElementById('ec-auth-fixed')) return;
    const style=document.createElement('style');style.id='ec-auth-style';style.textContent='#ec-auth-fixed{display:flex;align-items:center;gap:8px;margin-left:8px;z-index:99999}#ec-auth-fixed button{border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer;background:#111827;color:#fff}#ec-auth-fixed .login{background:#4f46e5;border-color:#6366f1}#ec-auth-fixed .profile{display:flex;align-items:center;gap:7px}#ec-auth-fixed img{width:28px;height:28px;border-radius:50%;object-fit:cover}';document.head.appendChild(style);
    const box=document.createElement('div');box.id='ec-auth-fixed';
    const header=document.querySelector('header');const target=header?.querySelector('nav')||header||document.body;target.appendChild(box);
    async function render(){
      box.innerHTML='';const {data}=await sb.auth.getUser();const u=data?.user;
      if(!u){const b=document.createElement('button');b.className='login';b.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> Login';b.onclick=async()=>{const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)alert(error.message)};box.appendChild(b);return}
      const p=await ensureProfile(u);const b=document.createElement('button');b.className='profile';b.innerHTML=(p?.avatarUrl?`<img src="${p.avatarUrl}" alt="">`:'')+`<span>${p?.display_name||u.email||'Profile'}</span>`;b.onclick=()=>{try{if(typeof window.openProfileModal==='function')window.openProfileModal();else if(typeof window.showProfile==='function')window.showProfile();else location.hash='profile'}catch(e){console.warn(e)}};box.appendChild(b);
      const out=document.createElement('button');out.innerHTML='<i class="fa-solid fa-right-from-bracket"></i> Logout';out.onclick=async()=>{await sb.auth.signOut();location.reload()};box.appendChild(out);
    }
    window.renderSupabaseAuth=render;render();sb.auth.onAuthStateChange((e)=>{if(e==='SIGNED_IN'||e==='SIGNED_OUT'||e==='USER_UPDATED')setTimeout(render,50)});
    window.addEventListener('load',render);
  }
  const a=setInterval(()=>{if(installProfileBridge())clearInterval(a)},25);
  const u=setInterval(()=>{if(document.body){clearInterval(u);installVisibleAuth()}},25);
})();