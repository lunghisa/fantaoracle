-- ============================================================
-- Pulizia del fossile cloud sotto l'account ADMIN
-- ============================================================
--
-- Il pannello UTENTI mostra l'admin con "1 lega · 16 giocatori" anche se la
-- sua dashboard è pulita: i conteggi vengono dalle tabelle cloud, e lì è
-- rimasta la vecchia "La mia lega" dell'era demo (spinta mesi fa dalla
-- chiave piatta v1, prima delle correzioni). Il browser è già pulito:
-- queste righe sono l'ultima copia e vanno tolte a mano.
--
-- L'admin non usa leghe proprie (lavora sul listone globale), quindi
-- eliminare TUTTE le sue leghe è sicuro.

delete from public.roster_players
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch');

delete from public.oracle_states
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch');

delete from public.leagues
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch');

-- Controllo: tutte e tre le righe devono dire 0.
select 'leagues' as tabella, count(*) from public.leagues
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch')
union all
select 'roster_players', count(*) from public.roster_players
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch')
union all
select 'oracle_states', count(*) from public.oracle_states
 where user_id = (select id from auth.users where email = 'sacha@lunghi.ch');
