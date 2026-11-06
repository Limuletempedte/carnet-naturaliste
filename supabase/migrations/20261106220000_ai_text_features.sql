-- Assistant IA — phases 2 à 4 : socle des fonctionnalités texte (bilan du
-- mois, note → fiche, recherche). Migration UNIQUE pour les trois phases.
-- Plan : docs/plans/assistant-ia-phases-2-4.md. Exploitation : docs/ops/ASSISTANT-IA.md.
-- Retour arrière : docs/ops/retour-arriere-ai-text-features.sql (hors migrations/).
--
-- Principe : la demande d'accès et l'approbation manuelle (`ai_access`)
-- restent globales ; `ai_access.consent_version` reste le consentement PHOTO
-- (2026-11-v1) et n'est pas modifié. Chaque fonctionnalité texte a son propre
-- consentement (table `ai_consents`). Quota mensuel et budget restent communs
-- à toutes les fonctionnalités.
--
-- Compatibilité : la fonction Edge `ai-identify` en production appelle
-- `ai_reserve_call` par arguments nommés, avec 5 arguments. Le 6e argument
-- `p_feature` a la valeur par défaut 'identify' : elle continue de fonctionner
-- SANS redéploiement. Une seule version de la fonction doit exister (deux
-- versions rendraient l'appel ambigu : erreur PostgREST PGRST203).
--
-- ⚠️ DROITS : une nouvelle table de `public` donne par défaut TOUS les droits
-- à anon/authenticated, et une fonction recréée est exécutable par PUBLIC,
-- anon et authenticated. D'où les `revoke` explicites ci-dessous.
-- `service_role` reçoit ses droits explicitement (base locale neuve).
--
-- Pas de BEGIN/COMMIT : la CLI applique ce fichier dans une seule transaction.

-- Ne jamais faire attendre les connexions : la clé étrangère vers auth.users et
-- la modification de ai_usage prennent des verrous. Si l'un d'eux n'est pas
-- obtenu en 5 s, la migration échoue (rien n'est appliqué) et se relance.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) ai_usage.feature : accepter les fonctionnalités texte
-- ---------------------------------------------------------------------------

-- La contrainte d'origine n'avait pas de nom explicite : Postgres l'a nommée
-- ai_usage_feature_check. Si la production en portait une autre, le bloc
-- suivant fait échouer toute la migration (rien n'est appliqué).
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

do $$
declare
  v_names text;
begin
  select string_agg(conname, ', ') into v_names
    from pg_constraint
   where conrelid = 'public.ai_usage'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ~* '\mfeature\M';
  if v_names is not null then
    raise exception 'ai_usage : contrainte(s) CHECK inattendue(s) sur feature : %', v_names;
  end if;
end $$;

-- Même liste que dans ai_reserve_call ci-dessous (un test Vitest les compare).
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('identify', 'summary', 'note', 'search'));

-- ---------------------------------------------------------------------------
-- 2) Consentements par fonctionnalité texte
-- ---------------------------------------------------------------------------

create table if not exists public.ai_consents (
  -- Référence auth.users et non ai_access : « Renouveler » l'accès photo
  -- supprime puis recrée la ligne ai_access, sans toucher aux consentements.
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('summary', 'note', 'search')),
  version text not null check (char_length(version) between 1 and 32),
  -- Preuve du consentement (RGPD art. 7.1) : posée par le serveur, jamais
  -- choisie ni modifiée par l'utilisateur.
  given_at timestamptz not null default now(),
  primary key (user_id, feature)
);

comment on table public.ai_consents is
  'Consentement à une fonctionnalité IA texte (une ligne par personne et par fonctionnalité). Retrait = suppression ; renouvellement = suppression puis insertion.';

revoke all on table public.ai_consents from public, anon, authenticated;

-- Utilisateur connecté : lire ses consentements, les retirer, et en donner un
-- en ne fournissant QUE ces trois colonnes (given_at garde sa valeur par
-- défaut). Aucune mise à jour : un renouvellement passe par suppression puis
-- insertion, jamais par un upsert.
grant select, delete on table public.ai_consents to authenticated;
grant insert (user_id, feature, version) on table public.ai_consents to authenticated;

grant select, insert, update, delete on table public.ai_consents to service_role;

alter table public.ai_consents enable row level security;

drop policy if exists "ai_consents_select_own" on public.ai_consents;
create policy "ai_consents_select_own" on public.ai_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_consents_delete_own" on public.ai_consents;
create policy "ai_consents_delete_own" on public.ai_consents
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_consents_insert_own" on public.ai_consents;
create policy "ai_consents_insert_own" on public.ai_consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Aucune règle de mise à jour (volontaire).

-- ---------------------------------------------------------------------------
-- 3) ai_reserve_call : 6e argument p_feature
--    Même logique qu'en phase 1, sauf : consentement de la fonctionnalité,
--    anti double-clic par fonctionnalité, et `feature` écrite dans ai_usage.
--    Drop + create dans la même transaction : les autres sessions voient
--    l'ancienne ou la nouvelle version, jamais aucune.
-- ---------------------------------------------------------------------------

drop function if exists public.ai_reserve_call(uuid, text, text, numeric, numeric);
create function public.ai_reserve_call(
  p_user uuid,
  p_consent_version text,
  p_model text,
  p_budget_usd numeric,
  p_max_cost_usd numeric,
  p_feature text default 'identify'
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
  -- Même liste que la contrainte ai_usage_feature_check.
  if p_feature is null or p_feature not in ('identify', 'summary', 'note', 'search') then
    raise exception 'ai_reserve_call: fonctionnalité inconnue';
  end if;

  -- Une seule réservation à la fois, toutes fonctionnalités confondues : ni le
  -- quota ni le budget ne peuvent être dépassés par des appels simultanés.
  perform pg_advisory_xact_lock(hashtext('ai_budget'));

  -- Conservation 3 mois : purge au passage, sans tâche planifiée.
  delete from public.ai_usage where created_at < now() - interval '3 months';

  -- Accès approuvé exigé, quelle que soit la fonctionnalité.
  select a.status, a.monthly_quota, a.consent_version
    into v_status, v_quota, v_consent
    from public.ai_access a
   where a.user_id = p_user;

  if not found or v_status is distinct from 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  -- Consentement : photo dans ai_access, texte dans ai_consents (une finalité
  -- par ligne). Égalité stricte : une version inventée ne peut que bloquer
  -- son auteur. Sans ligne, v_consent devient null, donc consent_outdated.
  if p_feature <> 'identify' then
    v_consent := null;
    select c.version into v_consent
      from public.ai_consents c
     where c.user_id = p_user
       and c.feature = p_feature;
  end if;
  if v_consent is distinct from p_consent_version then
    return jsonb_build_object('ok', false, 'reason', 'consent_outdated');
  end if;

  -- Anti double-clic, par fonctionnalité : un appel resté bloqué ne gèle pas
  -- les autres fonctionnalités. Au plus 4 appels en cours par personne, chacun
  -- compté dans le quota et réservé à son coût maximum.
  if exists (
    select 1 from public.ai_usage u
     where u.user_id = p_user
       and u.feature = p_feature
       and u.status = 'pending'
       and u.created_at > now() - interval '3 minutes'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  -- Quota : toutes les lignes du mois sauf les échecs non imputables, toutes
  -- fonctionnalités confondues.
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

  insert into public.ai_usage (user_id, feature, model, cost_usd, status)
  values (p_user, p_feature, p_model, p_max_cost_usd, 'pending')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'usage_id', v_id, 'remaining', v_quota - v_used - 1);
end;
$$;

comment on function public.ai_reserve_call(uuid, text, text, numeric, numeric, text) is
  'Réserve un appel IA (accès, consentement de la fonctionnalité, anti double-clic, quota, budget) sous verrou. Réservée à service_role.';

revoke execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric, text) to service_role;

-- Garde : exactement une version de ai_reserve_call.
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
    raise exception 'ai_reserve_call : % version(s), 1 attendue (sinon appel ambigu PGRST203)', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) ai_my_status : détail par fonctionnalité et consentements
--    `create or replace` : même signature, droits conservés. Les 8 champs de
--    la phase 1 sont inchangés (l'application en production les lit).
-- ---------------------------------------------------------------------------

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
  v_by_feature jsonb;
  v_consents jsonb;
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

  select coalesce(jsonb_object_agg(s.feature, s.n), '{}'::jsonb) into v_by_feature
    from (
      select u.feature, count(*) as n
        from public.ai_usage u
       where u.user_id = v_uid
         and u.created_at >= v_month_start
         and u.status <> 'failed'
       group by u.feature
    ) s;

  select coalesce(jsonb_object_agg(c.feature, c.version), '{}'::jsonb) into v_consents
    from public.ai_consents c
   where c.user_id = v_uid;

  return jsonb_build_object(
    'status', v_access.status,
    'consent_version', v_access.consent_version,
    'monthly_quota', v_access.monthly_quota,
    'used', v_used,
    'remaining', greatest(0, v_access.monthly_quota - v_used),
    'note', v_access.note,
    'requested_at', v_access.requested_at,
    'decided_at', v_access.decided_at,
    'used_by_feature', v_by_feature,
    'consents', v_consents
  );
end;
$$;

comment on function public.ai_my_status() is
  'État de l''accès IA, utilisations restantes du mois (détail par fonctionnalité) et consentements texte de l''utilisateur connecté.';

-- Réaffirmés (sans effet en production, utiles sur une base locale neuve).
revoke execute on function public.ai_my_status() from public, anon;
grant execute on function public.ai_my_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Cache de schéma PostgREST (nouvelle signature, nouvelle table).
--    Le signal part au commit, une fois tout visible.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
