-- ============================================================
-- Consenso delle fonti, pubblicato dall'admin per giornata
-- ============================================================
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
--
-- Le fasce dei consigli delle testate (FantaMaster, SOS Fanta...) entrano
-- nell'Oracle come fattore a peso limitato (±0.3 max): 1 = consigliato da
-- tutte le fonti, 2 = pareri misti, 3 = sconsigliato. In piu un segnale
-- facoltativo di titolarita che riempie dove le news tacciono.
--
-- `consigli` e una mappa chiave-normalizzata → { fascia, tit, name, team },
-- stesse chiavi delle rose degli utenti. Una riga per giornata, upsert:
-- ripubblicare corregge, non duplica. Stesse regole di global_voti.

create table if not exists public.global_consigli (
  id uuid primary key default gen_random_uuid(),
  giornata int not null unique,
  consigli jsonb not null,
  players_count int not null default 0,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

alter table public.global_consigli enable row level security;

drop policy if exists "global_consigli_read_all" on public.global_consigli;
create policy "global_consigli_read_all" on public.global_consigli
  for select to authenticated using (true);

drop policy if exists "global_consigli_admin_write" on public.global_consigli;
create policy "global_consigli_admin_write" on public.global_consigli
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Controllo: deve comparire una riga con rowsecurity = true.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'global_consigli';
