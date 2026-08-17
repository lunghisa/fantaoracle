-- ============================================================
-- I calendari delle competizioni seguono l'utente, non il computer
-- ============================================================
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
--
-- Il problema: campionato, coppa e le altre competizioni erano salvate solo
-- in localStorage, che vive nel browser. Un utente che si logga da un altro
-- computer ritrovava lega, rosa e giorni di prova — ma i calendari no, e
-- quindi niente scontro diretto: doveva ricaricare i file a mano su ogni
-- dispositivo, senza che niente glielo dicesse.
--
-- Due colonne sulla tabella che gia c'e, invece di una tabella nuova: le
-- competizioni appartengono a una lega e muoiono con lei. Il vincolo di
-- cancellazione a cascata arriva gratis, e le policy RLS di `leagues`
-- coprono gia queste colonne senza doverne scrivere altre.

-- L'elenco delle competizioni, ognuna con le sue partite.
alter table public.leagues
  add column if not exists competizioni jsonb;

-- Quale delle sue e quella in uso per lo scontro diretto.
alter table public.leagues
  add column if not exists comp_attiva text;

-- Controllo: qui devono comparire due righe.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leagues'
  and column_name in ('competizioni', 'comp_attiva')
order by column_name;
