-- ============================================================
-- global_previsioni — previsioni Oracle CONGELATE per giornata
-- ============================================================
--
-- Il pannello "misura oracle (retro)" può ricostruire solo la previsione
-- BASE (i fattori storicizzati). Per misurare l'Oracle COMPLETO — con
-- probabili, infermeria, consenso del venerdì — bisogna fotografare le
-- previsioni PRIMA della deadline e confrontarle coi voti il martedì.
-- Questa tabella è la fotografia: la scrive l'admin col bottone
-- "❄ congela previsioni" in STRUMENTI, la legge il pannello misura.
--
-- Una riga per giornata. `previsioni` è { chiave_giocatore: {exp, conf,
-- role, team, name} } — la chiave è il nome normalizzato, la stessa dei
-- voti globali. Il congelamento ripetuto PRIMA della deadline sovrascrive
-- (l'ultima foto è la più informata); dopo la deadline il client rifiuta.

create table if not exists public.global_previsioni (
  giornata      integer primary key,
  previsioni    jsonb not null,
  players_count integer not null default 0,
  frozen_at     timestamptz not null default now(),
  frozen_by     uuid references auth.users(id)
);

alter table public.global_previsioni enable row level security;

-- Lettura: chi è autenticato (serve al pannello misura; non contiene
-- nulla di segreto — sono gli stessi indici che l'app mostra a tutti).
drop policy if exists global_previsioni_read on public.global_previsioni;
create policy global_previsioni_read on public.global_previsioni
  for select to authenticated using (true);

-- Scrittura: solo admin.
drop policy if exists global_previsioni_write on public.global_previsioni;
create policy global_previsioni_write on public.global_previsioni
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- CONTROLLO ----
-- Vuota alla creazione; dopo il primo congelamento deve mostrare una riga
-- con giornata, players_count e frozen_at.
select giornata, players_count, frozen_at from public.global_previsioni order by giornata;
