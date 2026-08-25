-- ============================================================
-- Voti di giornata pubblicati dall'admin, per tutti gli utenti
-- ============================================================
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
--
-- I fantavoti di ogni giornata li carica l'admin una volta sola e li
-- pubblica per tutti, come il listone e il calendario. Prima ogni utente
-- doveva inserirli a mano nella propria app: lavoro moltiplicato per il
-- numero di utenti, e chi non lo faceva aveva un Oracle mai ricalibrato.
--
-- Una riga per giornata. `votes` e una mappa
--   chiave-normalizzata → { v: fantavoto, name, team }
-- con le chiavi nello stesso formato usato dalle rose degli utenti,
-- cosi ogni app pesca i voti dei propri giocatori senza rifare abbinamenti.

create table if not exists public.global_voti (
  id uuid primary key default gen_random_uuid(),
  giornata int not null unique,
  votes jsonb not null,
  players_count int not null default 0,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

-- Stesse regole di global_listino: leggono tutti gli autenticati,
-- scrive solo l'admin.
alter table public.global_voti enable row level security;

drop policy if exists "global_voti_read_all" on public.global_voti;
create policy "global_voti_read_all" on public.global_voti
  for select to authenticated using (true);

drop policy if exists "global_voti_admin_write" on public.global_voti;
create policy "global_voti_admin_write" on public.global_voti
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Controllo: deve comparire una riga con rowsecurity = true.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'global_voti';
