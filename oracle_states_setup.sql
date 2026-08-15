-- ============================================================
-- FantaOracle — Sync cloud dello storico Oracle (per-lega)
-- Eseguire UNA VOLTA nel SQL Editor di Supabase.
-- Ricreato il 7 ago 2026 dal codice dell'app (l'originale della
-- vecchia chat non era stato salvato nel progetto).
-- La tabella resta vuota finché l'Oracle non registra voti reali
-- e calibrazione: si popola da sola durante la stagione.
-- ============================================================

create table if not exists public.oracle_states (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.oracle_states enable row level security;

-- Ognuno gestisce solo i propri stati Oracle
drop policy if exists "oracle_states_owner_all" on public.oracle_states;
create policy "oracle_states_owner_all" on public.oracle_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Gli admin possono leggere tutto (diagnostica)
drop policy if exists "oracle_states_admin_read" on public.oracle_states;
create policy "oracle_states_admin_read" on public.oracle_states
  for select using (public.is_admin());

-- Verifica: deve restituire la tabella con 0 righe
select 'oracle_states pronta' as esito, count(*) as righe from public.oracle_states;
