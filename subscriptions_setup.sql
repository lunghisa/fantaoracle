-- ============================================================
-- FantaOracle — Preparazione abbonamenti (livelli, prezzo storico, valuta)
-- ------------------------------------------------------------
-- Eseguire UNA VOLTA nel SQL Editor di Supabase, DOPO billing_setup.sql
-- e DOPO admin_lockdown.sql (la sezione 4 riscrive un trigger definito li).
--
-- A cosa serve:
--   1. Poter alzare i prezzi senza penalizzare chi ha gia pagato: ogni
--      abbonamento si porta dietro il prezzo con cui e nato.
--   2. Poter aggiungere livelli tipo base/premium senza rifare lo schema.
--   3. Vendere sia in CHF (Ticino) che in EUR (Italia): un prezzo senza
--      la valuta accanto, su un pubblico misto, e un numero inutile.
--
-- NON rompe niente di quello che gira: profiles.plan resta dov'e ed e
-- ancora la colonna che l'app legge. Qui si aggiunge soltanto.
-- Lo script si puo rieseguire piu volte senza danni.
-- ============================================================


-- ============================================================
-- 1) REGISTRO DEGLI ABBONAMENTI  ← il pezzo che conta
-- ------------------------------------------------------------
-- Una riga per abbonamento sottoscritto. E qui che vive la verita: il
-- prezzo viene copiato dentro la riga al momento dell'acquisto e non si
-- tocca mai piu. Se domani la stagione passa da 9.90 a 19.90, le righe
-- vecchie continuano a dire 9.90 e sai esattamente chi proteggere.
-- ============================================================
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- COSA ha comprato: due dimensioni separate, non una stringa unica.
  -- Tenerle divise e cio che permette di aggiungere 'premium' domani senza
  -- inventare valori tipo 'premium_year' da interpretare a mano nel codice.
  tier          text not null default 'base',      -- 'base' | 'premium'
  period        text not null,                     -- 'month' | 'season'

  -- A QUANTO l'ha comprato. Congelato qui per sempre.
  price         numeric(8,2) not null,
  currency      text not null default 'CHF',       -- 'CHF' (Ticino) | 'EUR' (Italia)

  -- QUANDO, e fino a quando.
  started_at    timestamptz not null default now(),
  ends_at       timestamptz,                       -- null = rinnovo automatico attivo
  status        text not null default 'active',    -- 'active' | 'cancelled' | 'expired'

  -- Aggancio al sistema di pagamento, quando ci sara.
  provider      text,                              -- es. 'stripe'
  provider_ref  text,                              -- id della sottoscrizione dal provider

  created_at    timestamptz not null default now(),

  constraint subscriptions_tier_valid     check (tier     in ('base', 'premium')),
  constraint subscriptions_period_valid   check (period   in ('month', 'season')),
  constraint subscriptions_currency_valid check (currency in ('CHF', 'EUR')),
  constraint subscriptions_status_valid   check (status   in ('active', 'cancelled', 'expired')),
  constraint subscriptions_price_positive check (price >= 0)
);

comment on table  public.subscriptions is 'Registro abbonamenti: il prezzo e congelato alla sottoscrizione, per poter alzare i listini senza penalizzare chi c era gia.';
comment on column public.subscriptions.price    is 'Prezzo pagato ALLA SOTTOSCRIZIONE. Non aggiornare mai su righe esistenti.';
comment on column public.subscriptions.currency is 'Valuta del prezzo. Senza questa, price non significa niente su un pubblico misto CH/IT.';

create index if not exists subscriptions_user_idx   on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- Un solo abbonamento attivo per persona: se ne arriva un secondo, e un bug
-- (doppio addebito). Meglio che il database lo rifiuti subito.
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id) where status = 'active';


-- ============================================================
-- 2) SICUREZZA DEL REGISTRO (RLS)
-- ------------------------------------------------------------
-- Punto delicato: l'utente puo LEGGERE il proprio abbonamento ma NON puo
-- scriverlo. Nessuna policy di insert/update/delete per gli utenti, di
-- proposito.
--
-- Perche: plan_interest e scrivibile dall'utente, ed e giusto, e una lista
-- d'attesa. Qui no. Se un utente potesse inserire una riga in subscriptions
-- si regalerebbe il premium dal browser in dieci secondi. Le righe le scrive
-- solo il server (service_role), che scavalca la RLS.
-- ============================================================
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Volutamente assenti: policy di insert, update e delete per gli utenti.


-- ============================================================
-- 3) STATO CORRENTE SUL PROFILO (lettura veloce per l'app)
-- ------------------------------------------------------------
-- Copia comoda dello stato attuale, cosi l'app non deve interrogare il
-- registro a ogni schermata. La verita resta subscriptions: queste colonne
-- sono un riassunto, e vanno riscritte dal server insieme alla riga nuova.
-- ============================================================
alter table public.profiles add column if not exists plan_tier   text not null default 'free';  -- 'free' | 'base' | 'premium'
alter table public.profiles add column if not exists plan_period text;                          -- null | 'month' | 'season'

-- Allinea i profili esistenti partendo dalla vecchia colonna plan.
update public.profiles
   set plan_tier   = case when plan in ('month', 'year') then 'base' else 'free' end,
       plan_period = case plan
                       when 'month' then 'month'
                       when 'year'  then 'season'
                       else null
                     end
 where plan_tier = 'free'
   and plan_period is null;


-- ============================================================
-- 4) PROTEZIONE DELLE COLONNE NUOVE  ← NON SALTARE QUESTA PARTE
-- ------------------------------------------------------------
-- admin_lockdown.sql definisce un trigger che impedisce agli utenti di
-- modificarsi is_admin e plan dal browser. Le colonne plan_tier e
-- plan_period appena aggiunte NON sarebbero coperte: e siccome la policy
-- profiles_update_own permette a ognuno di scrivere sulla propria riga,
-- chiunque potrebbe regalarsi il premium con una riga di JavaScript.
--
-- Qui si riscrive la stessa funzione aggiungendo le due colonne nuove.
-- Il trigger esistente punta gia a questa funzione: non va ricreato.
-- ============================================================
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin    := false;
      new.plan        := 'free';
      new.plan_tier   := 'free';
      new.plan_period := null;
    else
      new.is_admin    := old.is_admin;
      new.plan        := old.plan;
      new.plan_tier   := old.plan_tier;
      new.plan_period := old.plan_period;
      if old.trial_started_at is not null then
        new.trial_started_at := old.trial_started_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;


-- ============================================================
-- 5) VERIFICA — esegui questa dopo lo script e guarda il risultato
-- ------------------------------------------------------------
-- Deve stampare 5 righe, tutte con esito 'OK'.
-- ============================================================
select 'tabella subscriptions'      as controllo,
       case when to_regclass('public.subscriptions') is not null
            then 'OK' else 'MANCA' end as esito
union all
select 'colonna profiles.plan_tier',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'profiles'
                            and column_name = 'plan_tier')
            then 'OK' else 'MANCA' end
union all
select 'colonna profiles.plan_period',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'profiles'
                            and column_name = 'plan_period')
            then 'OK' else 'MANCA' end
union all
select 'utenti NON possono scrivere subscriptions',
       case when not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'subscriptions'
                                and cmd in ('INSERT', 'UPDATE', 'DELETE'))
            then 'OK' else 'ATTENZIONE: esiste una policy di scrittura' end
union all
select 'trigger protegge plan_tier',
       case when (select prosrc from pg_proc where proname = 'protect_profile_columns') like '%plan_tier%'
            then 'OK' else 'MANCA' end;


-- ============================================================
-- 6) QUERY PRONTE PER TE (da incollare nel SQL Editor quando servono)
-- ------------------------------------------------------------
-- Nota: l'email non sta in profiles (li c'e username), sta in auth.users.
--
-- Chi paga adesso, con che prezzo e in che valuta:
--   select u.email, p.username, s.tier, s.period, s.price, s.currency, s.started_at
--     from public.subscriptions s
--     join auth.users u      on u.id = s.user_id
--     left join public.profiles p on p.id = s.user_id
--    where s.status = 'active'
--    order by s.started_at desc;
--
-- Incasso per valuta — NON sommare mai CHF ed EUR nella stessa cifra:
--   select currency, period, count(*) as abbonati, sum(price) as totale
--     from public.subscriptions
--    where status = 'active'
--    group by currency, period
--    order by currency, period;
--
-- Chi va protetto se alzi il listino (ha comprato sotto il prezzo nuovo):
--   select u.email, s.price, s.currency, s.started_at
--     from public.subscriptions s
--     join auth.users u on u.id = s.user_id
--    where s.status = 'active' and s.currency = 'CHF' and s.price < 19.90
--    order by s.started_at;
--
-- Chi ha lasciato l'interesse ma non ha mai sottoscritto (lista da ricontattare):
--   select distinct i.email, i.plan, i.created_at
--     from public.plan_interest i
--    where not exists (select 1 from public.subscriptions s
--                       where s.user_id = i.user_id and s.status = 'active')
--    order by i.created_at desc;
-- ============================================================
