-- Assistant d'identification par IA — phase 1 (socle : accès, quota, budget).
-- Plan : docs/plans/assistant-ia-phase1.md. Exploitation : docs/ops/ASSISTANT-IA.md.
--
-- Principe : chaque personne DEMANDE l'accès (ligne `pending`), le propriétaire
-- valide à la main dans le tableau de bord (rôle postgres). La fonction Edge
-- `ai-identify` réserve chaque appel (quota mensuel + budget global, sous
-- verrou), puis écrit le coût réel.
--
-- ⚠️ DROITS : sur un projet Supabase, les nouvelles tables de `public` donnent
-- par défaut TOUS les droits à anon/authenticated, et les nouvelles fonctions
-- sont exécutables par PUBLIC, anon et authenticated. Sans les `revoke`
-- ci-dessous, un utilisateur pourrait insérer `status = 'approved'` et
-- s'approuver lui-même, ou appeler `ai_reserve_call` directement.
-- `service_role` reçoit ses droits explicitement : une base locale neuve n'a
-- pas forcément les droits par défaut de la production.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table if not exists public.ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'refused', 'revoked')),
  monthly_quota integer not null default 20
    check (monthly_quota between 0 and 1000),
  consent_version text not null
    check (char_length(consent_version) between 1 and 32),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  -- Lisible par l'utilisateur concerné : rédiger en conséquence.
  note text check (note is null or char_length(note) <= 500)
);

comment on table public.ai_access is
  'Accès à l''assistant IA. Une ligne par personne ; validation manuelle (status). Note lisible par l''utilisateur.';

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  -- set null et non cascade : supprimer un compte ne doit pas faire baisser
  -- la dépense du mois. La ligne devient anonyme.
  user_id uuid references auth.users(id) on delete set null,
  feature text not null default 'identify' check (feature in ('identify')),
  created_at timestamptz not null default now(),
  model text not null check (char_length(model) between 1 and 64),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  -- Coût maximum tant que la ligne est `pending`, coût réel ensuite.
  cost_usd numeric(10, 6) not null check (cost_usd >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'refused', 'invalid_output', 'failed'))
);

comment on table public.ai_usage is
  'Journal des appels à l''assistant IA (quota et budget). Conservé 3 mois, purgé par ai_reserve_call.';

create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at);

-- ---------------------------------------------------------------------------
-- 2) Droits explicites
-- ---------------------------------------------------------------------------

revoke all on table public.ai_access, public.ai_usage from public, anon, authenticated;

-- Utilisateur connecté : lire sa ligne, la supprimer (retrait de l'accord),
-- et créer une demande en ne fournissant QUE ces deux colonnes.
grant select, delete on table public.ai_access to authenticated;
grant insert (user_id, consent_version) on table public.ai_access to authenticated;
-- Lire son propre journal (nombre d'analyses du mois). Aucune écriture.
grant select on table public.ai_usage to authenticated;

grant select, insert, update, delete on table public.ai_access, public.ai_usage to service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS — aucune règle de mise à jour ; aucune écriture dans ai_usage
-- ---------------------------------------------------------------------------

alter table public.ai_access enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "ai_access_select_own" on public.ai_access;
create policy "ai_access_select_own" on public.ai_access
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_access_delete_own" on public.ai_access;
create policy "ai_access_delete_own" on public.ai_access
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_access_insert_own_pending" on public.ai_access;
create policy "ai_access_insert_own_pending" on public.ai_access
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and monthly_quota = 20
    and decided_at is null
    and note is null
  );

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4) Fonctions
--    plpgsql VOLATILE : chaque instruction après le verrou prend un nouvel
--    instantané et voit les réservations déjà validées (READ COMMITTED).
--    `drop … if exists` avant chaque `create` : une signature modifiée créerait
--    sinon une surcharge qui garderait les droits par défaut.
-- ---------------------------------------------------------------------------

drop function if exists public.ai_reserve_call(uuid, text, text, numeric, numeric);
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

drop function if exists public.ai_finalize_call(uuid, text, integer, integer, numeric);
create function public.ai_finalize_call(
  p_id uuid,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_id is null
     or p_status is null or p_status not in ('ok', 'refused', 'invalid_output', 'failed')
     or p_cost_usd is null or p_cost_usd < 0
     or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'ai_finalize_call: arguments invalides';
  end if;

  -- Ne touche qu'aux lignes encore `pending`. Une ligne jamais finalisée
  -- (fonction coupée) garde le coût maximum : c'est prudent.
  update public.ai_usage
     set status = p_status,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cost_usd = p_cost_usd
   where id = p_id
     and status = 'pending';
  return found;
end;
$$;

comment on function public.ai_finalize_call(uuid, text, integer, integer, numeric) is
  'Écrit le statut et le coût réel d''un appel IA réservé. Réservée à service_role.';

drop function if exists public.ai_my_status();
create function public.ai_my_status()
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

revoke execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.ai_reserve_call(uuid, text, text, numeric, numeric) to service_role;

revoke execute on function public.ai_finalize_call(uuid, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.ai_finalize_call(uuid, text, integer, integer, numeric) to service_role;

revoke execute on function public.ai_my_status() from public, anon;
grant execute on function public.ai_my_status() to authenticated, service_role;
