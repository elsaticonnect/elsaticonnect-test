create extension if not exists pgcrypto;

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  quantity integer not null,
  deadline text not null,
  notes text not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  created_by_company text not null,
  selected_quote_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references public.rfqs(id) on delete cascade not null,
  supplier_user_id uuid references auth.users(id) on delete cascade not null,
  supplier_company text not null,
  price numeric not null,
  delivery text not null,
  notes text not null,
  status text not null default 'Under review',
  created_at timestamptz not null default now()
);

alter table public.rfqs enable row level security;
alter table public.quotes enable row level security;

drop policy if exists "Authenticated users can read rfqs" on public.rfqs;
create policy "Authenticated users can read rfqs"
on public.rfqs for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can create rfqs" on public.rfqs;
create policy "Authenticated users can create rfqs"
on public.rfqs for insert
with check (auth.role() = 'authenticated' and auth.uid() = created_by);

drop policy if exists "RFQ owners can update their rfqs" on public.rfqs;
create policy "RFQ owners can update their rfqs"
on public.rfqs for update
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "Authenticated users can read quotes" on public.quotes;
create policy "Authenticated users can read quotes"
on public.quotes for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can create quotes" on public.quotes;
create policy "Authenticated users can create quotes"
on public.quotes for insert
with check (auth.role() = 'authenticated' and auth.uid() = supplier_user_id);

drop policy if exists "Suppliers can update their own quotes" on public.quotes;
create policy "Suppliers can update their own quotes"
on public.quotes for update
using (auth.uid() = supplier_user_id)
with check (auth.uid() = supplier_user_id);
