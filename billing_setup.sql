-- ============================================================
-- FantaOracle — Setup prova 15 giorni + interesse abbonamento
-- Eseguire UNA VOLTA nel SQL Editor di Supabase (come oracle_states_setup.sql)
-- L'app funziona anche senza questa migrazione (fallback localStorage),
-- ma senza: la prova non segue l'account tra dispositivi e "Ti avviso"
-- non salva l'email nel cloud.
-- ============================================================

-- 1) Colonne piano/prova sul profilo
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists plan text not null default 'free';
-- Valori previsti per plan: 'free' | 'month' | 'year'
-- (gli admin restano riconosciuti da is_admin, il piano non conta per loro)

-- 2) Tabella interesse abbonamento (bottone "Ti avviso")
create table if not exists public.plan_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  plan text,                -- 'month' | 'year'
  created_at timestamptz not null default now()
);

alter table public.plan_interest enable row level security;

drop policy if exists "plan_interest_insert_own" on public.plan_interest;
create policy "plan_interest_insert_own" on public.plan_interest
  for insert with check (auth.uid() = user_id);

drop policy if exists "plan_interest_select_own" on public.plan_interest;
create policy "plan_interest_select_own" on public.plan_interest
  for select using (auth.uid() = user_id);

-- Per leggere TUTTI gli interessati (tu, da admin): usa il SQL Editor
--   select email, plan, created_at from public.plan_interest order by created_at desc;
