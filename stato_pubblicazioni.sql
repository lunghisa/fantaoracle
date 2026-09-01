-- ============================================================
-- stato_pubblicazioni — vista pubblica di SOLI METADATI
-- ============================================================
-- Serve alla routine del martedì per verificare da sola che una
-- pubblicazione sia davvero arrivata nel cloud.
--
-- Il problema che risolve: global_voti e global_listino sono leggibili
-- solo "to authenticated" (giustamente). Una routine non autenticata
-- riceve [] da entrambe e non puo distinguere "non pubblicato" da
-- "non ho il permesso di vedere". Cosi la verifica della pubblicazione
-- restava un passo manuale che nessuno controllava.
--
-- Cosa espone: tipo, riferimento (numero giornata o etichetta listino),
-- quanti giocatori, quando. NIENTE ALTRO.
-- Cosa NON espone: la colonna votes (i voti veri), uploaded_by (chi ha
-- pubblicato), e ovviamente nulla di profiles/leagues/roster_players.
--
-- Nota sulla sicurezza: la vista e deliberatamente SECURITY DEFINER
-- (security_invoker = off). E il modo corretto di pubblicare una
-- proiezione ristretta di tabelle protette da RLS: l'RLS filtra le
-- righe, non le colonne, quindi non si puo ottenere lo stesso con una
-- policy. Il perimetro e tutto qui: se un giorno si aggiungono colonne
-- alla vista, rileggere questo commento prima.

create or replace view public.stato_pubblicazioni
with (security_invoker = off)
as
select
  'voti'::text                    as tipo,
  v.giornata::text                as riferimento,
  v.players_count                 as giocatori,
  v.uploaded_at                   as pubblicato_il
from public.global_voti v
union all
select
  'listino'::text,
  coalesce(l.version_label, '(senza etichetta)'),
  l.players_count,
  l.uploaded_at
from public.global_listino l
where l.is_active;

-- Sola lettura, a chiunque: sono metadati di prodotto, non dati utente.
revoke all on public.stato_pubblicazioni from anon, authenticated;
grant select on public.stato_pubblicazioni to anon, authenticated;

-- ---- CONTROLLO ----
-- Deve elencare una riga per giornata pubblicata piu una per il listino
-- attivo. Se e vuota, non e stato pubblicato ancora nulla.
select * from public.stato_pubblicazioni order by tipo, pubblicato_il desc;
