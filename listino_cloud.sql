-- ============================================================
-- Il file della lega segue l'utente, non il computer
-- ============================================================
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
--
-- Terzo e ultimo pezzo che viveva solo nel browser. Gia sistemati: le rose
-- (tabella roster_players) e i calendari delle competizioni.
--
-- Qui va il listone caricato dall'utente da Leghe Fantacalcio: l'elenco
-- completo con fantasquadre, costi e quotazioni. Senza, chi apriva l'app da
-- un altro computer poteva schierare — la rosa c'era — ma perdeva chi
-- possiede chi nella sua lega, e quanto e costato.
--
-- Ci finisce SOLO il listone personale. Quello globale che pubblichi tu
-- dall'Admin Panel sta gia nel cloud: copiarlo dentro ogni lega di ogni
-- utente sarebbe la stessa tabella moltiplicata per il numero di iscritti.

alter table public.leagues
  add column if not exists listino jsonb;

-- Controllo: deve comparire una riga.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leagues'
  and column_name = 'listino';
