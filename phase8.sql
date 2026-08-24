create extension if not exists pgcrypto;

create table if not exists public.trade_requests (
  id text primary key,
  card_id uuid,
  proposer text,
  target_owner text,
  offer_type text,
  offered_card_id uuid,
  offered_card_name text,
  plus_amount numeric default 0,
  serial text,
  notes text,
  status text default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.system_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.sell_back_requests (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  seller_id uuid references auth.users(id) on delete set null,
  card_name text,
  amount numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trade_requests enable row level security;
alter table public.system_state enable row level security;
alter table public.sell_back_requests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trade_requests' and policyname='trade_requests_select') then
    create policy trade_requests_select on public.trade_requests for select to authenticated using (
      lower(coalesce(proposer,'')) = lower(coalesce((select email from auth.users where id=auth.uid()),''))
      or lower(coalesce(target_owner,'')) = lower(coalesce((select email from auth.users where id=auth.uid()),''))
      or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trade_requests' and policyname='trade_requests_insert') then
    create policy trade_requests_insert on public.trade_requests for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trade_requests' and policyname='trade_requests_update') then
    create policy trade_requests_update on public.trade_requests for update to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trade_requests' and policyname='trade_requests_delete') then
    create policy trade_requests_delete on public.trade_requests for delete to authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='system_state' and policyname='system_state_select') then
    create policy system_state_select on public.system_state for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='system_state' and policyname='system_state_write') then
    create policy system_state_write on public.system_state for all to authenticated using (
      exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    ) with check (
      exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sell_back_requests' and policyname='sell_back_select') then
    create policy sell_back_select on public.sell_back_requests for select to authenticated using (
      seller_id=auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sell_back_requests' and policyname='sell_back_insert') then
    create policy sell_back_insert on public.sell_back_requests for insert to authenticated with check (seller_id=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sell_back_requests' and policyname='sell_back_update') then
    create policy sell_back_update on public.sell_back_requests for update to authenticated using (
      seller_id=auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    ) with check (true);
  end if;
end $$;

create index if not exists trade_requests_card_idx on public.trade_requests(card_id);
create index if not exists trade_requests_status_idx on public.trade_requests(status);
create index if not exists trade_requests_created_idx on public.trade_requests(created_at desc);
create index if not exists sell_back_requests_seller_idx on public.sell_back_requests(seller_id);
create index if not exists sell_back_requests_status_idx on public.sell_back_requests(status);

alter table public.trade_requests replica identity full;
alter table public.system_state replica identity full;
alter table public.sell_back_requests replica identity full;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
