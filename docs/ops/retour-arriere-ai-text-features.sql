-- RETOUR ARRIÈRE de supabase/migrations/20261106220000_ai_text_features.sql.
-- ⚠️ Rangé HORS de supabase/migrations/ : ce n'est PAS une migration et la CLI
-- ne doit jamais l'appliquer. À n'utiliser qu'en cas de problème sérieux
-- après la mise en production, sur décision du propriétaire.
-- Mode d'emploi : docs/ops/ASSISTANT-IA.md, section « Retour arrière ».
--
-- À passer À LA MAIN, d'un seul bloc, dans l'éditeur SQL du tableau de bord
-- (ou psql). Il ne touche pas supabase_migrations.schema_migrations : la
-- migration reste notée comme appliquée. Toute correction ultérieure se fera
-- par une NOUVELLE migration horodatée, jamais par `migration repair`.
--
-- Ce qu'il fait :
--   a) remet ai_reserve_call à 5 arguments (corps EXACT de la phase 1) ;
--   b) remet ai_my_status de la phase 1 ;
--   c) GARDE la table ai_consents (preuves de consentement) — voir en bas ;
--   d) GARDE la contrainte élargie de ai_usage.feature : elle ne gêne pas la
--      phase 1, et l'ancienne échouerait dès qu'une ligne « summary » existe.
-- Avant : couper ai-text (AI_DISABLED_FEATURES ou budget à 0), sinon elle
-- échouera (internal_error) faute de 6e argument.

begin;
set local lock_timeout = '5s';

-- a) ai_reserve_call à 5 arguments (phase 1, 20261105161500_ai_identification.sql)
drop function if exists public.ai_reserve_call(uuid, text, text, numeric, numeric, text);
create function public.ai_reserve_call(
  p_user uuid,
  p_consent_version text,
  p_model text,
  p_budget_usd numeric,
  p_max_cost_usd numeric
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_quota integer;
  v_consent text;
  v_used integer;
  v_spent numeric;
  v_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  -- Un null ferait échouer silencieusement les comparaisons ci-dessous.
  if p_user is null or p_consent_version is null or p_model is null
     or p_budget_usd is null or p_budget_usd < 0
     or p_max_cost_usd is null or p_max_cost_usd <= 0 then
    raise exception 'ai_reserve_call: arguments invalides';
  end if;

  -- Une seule réservation à la fois (trafic faible) : ni le quota ni le
  -- budget ne peuvent être dépassés par des appels simultanés.
  perform pg_advisory_xact_lock(hashtext('ai_budget'));

  -- Conservation 3 mois : purge au passage, sans tâche planifiée.
  delete from public.ai_usage where created_at < now() - interval '3 months';

  select a.status, a.monthly_quota, a.consent_version
    into v_status, v_quota, v_consent
    from public.ai_access a
   where a.user_id = p_user;

  if not found or v_status is distinct from 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;
  if v_consent is distinct from p_consent_version then
    return jsonb_build_object('ok', false, 'reason', 'consent_outdated');
  end if;

  -- Anti double-clic : un appel encore en cours depuis moins de 3 minutes.
  if exists (
    select 1 from public.ai_usage u
     where u.user_id = p_user
       and u.status = 'pending'
       and u.created_at > now() - interval '3 minutes'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  -- Quota : toutes les lignes du mois sauf les échecs non imputables.
  select count(*) into v_used
    from public.ai_usage u
   where u.user_id = p_user
     and u.created_at >= v_month_start
     and u.status <> 'failed';
  if v_used >= v_quota then
    return jsonb_build_object('ok', false, 'reason', 'quota_exceeded');
  end if;

  -- Budget global du mois, comptes supprimés compris (user_id null).
  select coalesce(sum(u.cost_usd), 0) into v_spent
    from public.ai_usage u
   where u.created_at >= v_month_start;
  if v_spent + p_max_cost_usd > p_budget_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget_exhausted');
  end if;

  insert into public.ai_usage (user_id, model, cost_usd, status)
  values (p_user, p_model, p_max_cost_usd, 'pending')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'usage_id', v_id, 'remaining', v_quota - v_used - 1);
end;
$$;

comment on function public.ai_reserve_call(uuid, text, text, numeric, numeric) is
  'Réserve un appel IA (accès, consentement, anti double-clic, quota, budget) sous verrou. Réservée à service_role.';

revoke execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric) to service_role;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ai_reserve_call';
  if v_count <> 1 then
    raise exception 'ai_reserve_call : % version(s), 1 attendue', v_count;
  end if;
end $$;

-- b) ai_my_status de la phase 1 (create or replace : droits conservés)
create or replace function public.ai_my_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_access public.ai_access%rowtype;
  v_used integer;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if v_uid is null then
    return jsonb_build_object('status', 'none');
  end if;

  -- security invoker : la RLS limite la lecture aux lignes de l'appelant.
  select * into v_access from public.ai_access a where a.user_id = v_uid;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  -- Même règle de comptage que ai_reserve_call.
  select count(*) into v_used
    from public.ai_usage u
   where u.user_id = v_uid
     and u.created_at >= v_month_start
     and u.status <> 'failed';

  return jsonb_build_object(
    'status', v_access.status,
    'consent_version', v_access.consent_version,
    'monthly_quota', v_access.monthly_quota,
    'used', v_used,
    'remaining', greatest(0, v_access.monthly_quota - v_used),
    'note', v_access.note,
    'requested_at', v_access.requested_at,
    'decided_at', v_access.decided_at
  );
end;
$$;

comment on function public.ai_my_status() is
  'État de l''accès IA et analyses restantes du mois pour l''utilisateur connecté.';

revoke execute on function public.ai_my_status() from public, anon;
grant execute on function public.ai_my_status() to authenticated, service_role;

-- c) ai_consents : conservée (retour arrière temporaire = garder les preuves).
--    Abandon DÉFINITIF des fonctionnalités texte seulement (RGPD : ne pas
--    garder les données d'un traitement supprimé) — décommenter :
-- drop table if exists public.ai_consents;

-- d) Contrainte étroite d'origine : déconseillé. Si vraiment voulu, `not valid`
--    pour ne pas toucher aux lignes existantes (jamais d'update : le détail
--    du mois serait faussé) — décommenter :
-- alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
-- alter table public.ai_usage add constraint ai_usage_feature_check
--   check (feature in ('identify')) not valid;

notify pgrst, 'reload schema';

commit;
