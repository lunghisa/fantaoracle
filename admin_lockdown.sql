-- ============================================================
-- FantaOracle — BLINDATURA ADMIN (roadmap punto 4)
-- Eseguire UNA VOLTA nel SQL Editor di Supabase.
-- Chiude i buchi lato server:
--   1. nessuno può auto-promuoversi admin o regalarsi un piano
--   2. nessuno può allungarsi la settimana di prova
--   3. listone e calendario globali scrivibili SOLO dagli admin
--   4. i profili altrui (email!) leggibili solo dagli admin
-- Il SQL Editor e gli script admin di Sacha NON sono toccati
-- (le protezioni valgono solo per le richieste API degli utenti).
-- ============================================================

-- ---------- 0) Helper: l'utente corrente è admin? ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------- 1) Trigger: colonne sensibili di profiles ----------
-- Per le richieste degli utenti (auth.uid() presente) che NON sono admin:
--   is_admin e plan non si toccano; trial_started_at si scrive solo una volta.
-- SQL Editor / service role (auth.uid() nullo) restano liberi.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.plan := 'free';
    else
      new.is_admin := old.is_admin;
      new.plan := old.plan;
      if old.trial_started_at is not null then
        new.trial_started_at := old.trial_started_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------- 2) RLS su profiles ----------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- 3) Listone e calendario globali: scrive solo l'admin ----------
alter table public.global_listino enable row level security;

drop policy if exists "global_listino_read_all" on public.global_listino;
create policy "global_listino_read_all" on public.global_listino
  for select to authenticated using (true);

drop policy if exists "global_listino_admin_write" on public.global_listino;
create policy "global_listino_admin_write" on public.global_listino
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.global_calendar enable row level security;

drop policy if exists "global_calendar_read_all" on public.global_calendar;
create policy "global_calendar_read_all" on public.global_calendar
  for select to authenticated using (true);

drop policy if exists "global_calendar_admin_write" on public.global_calendar;
create policy "global_calendar_admin_write" on public.global_calendar
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- DIAGNOSTICA — il risultato di queste due query va incollato
-- in chat a Claude per la revisione finale.
-- ============================================================

-- A) Tutte le policy attive (per scovare eventuali vecchie policy permissive)
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
