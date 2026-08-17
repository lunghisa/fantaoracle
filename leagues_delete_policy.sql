-- ============================================================
-- Permesso di ELIMINARE le proprie leghe
-- ============================================================
--
-- Da eseguire SOLO se l'app, provando a eliminare una lega, risponde
--   "il database non lo consente (manca la policy di delete su leagues)".
-- Se elimina senza lamentarsi, la policy c'e gia e questo file non serve.
--
-- Perche serviva accorgersene: con la RLS attiva, una DELETE senza policy
-- corrispondente NON da errore. Semplicemente non cancella niente e risponde
-- ok. L'app diceva "eliminata", il registro locale la rimuoveva, e al
-- caricamento successivo il pull dal cloud la riportava indietro — per sempre.
--
-- Le due condizioni (using + user_id) sono entrambe necessarie: la prima dice
-- QUALI righe si possono eliminare, e senza di essa un utente potrebbe
-- eliminare le leghe di un altro.

-- Leghe: si eliminano solo le proprie.
drop policy if exists "leagues_delete_own" on public.leagues;
create policy "leagues_delete_own" on public.leagues
  for delete using (auth.uid() = user_id);

-- Rose: idem. Probabilmente c'e gia (la sincronizzazione le riscrive
-- cancellandole e reinserendole, e quello funziona), ma e idempotente.
drop policy if exists "roster_players_delete_own" on public.roster_players;
create policy "roster_players_delete_own" on public.roster_players
  for delete using (auth.uid() = user_id);

-- Stato Oracle: viene eliminato assieme alla lega. Se il vincolo verso
-- leagues ha ON DELETE CASCADE questa non serve, ma l'app prova a cancellare
-- esplicitamente prima, per non dipendere da come e stato definito il vincolo.
drop policy if exists "oracle_states_delete_own" on public.oracle_states;
create policy "oracle_states_delete_own" on public.oracle_states
  for delete using (auth.uid() = user_id);

-- Controllo: dopo l'esecuzione qui devono comparire tre righe.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('leagues', 'roster_players', 'oracle_states')
  and cmd = 'DELETE'
order by tablename;
