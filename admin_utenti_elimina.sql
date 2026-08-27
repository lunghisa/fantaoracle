-- ============================================================
-- Pannello UTENTI: eliminazione degli account disabilitati + piani
-- ============================================================
--
-- Da eseguire su Supabase: SQL Editor → incolla → Run.
--
-- 1) admin_delete_user: elimina DAVVERO un utente e tutti i suoi dati.
--    Tre guardie, tutte non negoziabili:
--    - la chiama solo un admin;
--    - si elimina solo un utente GIA disabilitato (prima OFF, poi cestino:
--      due gesti distinti, niente eliminazioni d'impulso);
--    - mai un admin, mai se stessi.
--    L'ordine delle cancellazioni rispetta le dipendenze: figli prima dei
--    padri, auth.users per ultimo.
--
-- 2) admin_list_plans: piano e inizio prova di ogni utente, per mostrare
--    nel pannello chi e in prova, chi e PRO, chi e scaduto.

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not public.is_admin() then
    raise exception 'solo un admin puo eliminare utenti';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'non puoi eliminare te stesso';
  end if;
  select p.is_admin, coalesce(p.disabled, false) as disabled
    into t from public.profiles p where p.id = target_user_id;
  if not found then
    raise exception 'utente inesistente';
  end if;
  if t.is_admin then
    raise exception 'non si elimina un admin: prima revoca il ruolo';
  end if;
  if not t.disabled then
    raise exception 'si eliminano solo utenti disabilitati: prima OFF, poi cestino';
  end if;

  delete from public.roster_players where user_id = target_user_id;
  delete from public.oracle_states  where user_id = target_user_id;
  delete from public.leagues        where user_id = target_user_id;
  delete from public.subscriptions  where user_id = target_user_id;
  delete from public.plan_interest  where user_id = target_user_id;
  delete from public.profiles       where id = target_user_id;
  delete from auth.users            where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_list_plans()
returns table (id uuid, plan text, trial_started_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.id, p.plan, p.trial_started_at
  from public.profiles p
  where public.is_admin();
$$;

revoke all on function public.admin_list_plans() from public;
grant execute on function public.admin_list_plans() to authenticated;

-- Controllo: devono comparire due righe.
select proname from pg_proc
where proname in ('admin_delete_user', 'admin_list_plans');
