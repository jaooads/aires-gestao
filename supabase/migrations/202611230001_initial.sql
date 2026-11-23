create extension if not exists pgcrypto;
create schema if not exists private;

create type public.organization_role as enum ('owner', 'admin', 'finance', 'viewer');
create type public.contract_pricing_model as enum ('fixed_contract', 'stage', 'hourly');
create type public.proposal_status as enum ('pending', 'confirmed', 'cancelled', 'expired');
create type public.ledger_direction as enum ('in', 'out');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_id_idx on public.organization_members(user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index projects_organization_id_idx on public.projects(organization_id);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(trim(name)) between 2 and 120),
  daily_rate_cents bigint check (daily_rate_cents is null or daily_rate_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index workers_organization_id_idx on public.workers(organization_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  name text not null,
  pricing_model public.contract_pricing_model not null,
  contracted_amount_cents bigint check (contracted_amount_cents is null or contracted_amount_cents >= 0),
  hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents > 0),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (pricing_model = 'hourly' and hourly_rate_cents is not null)
    or pricing_model in ('fixed_contract', 'stage')
  )
);
create index contracts_organization_id_idx on public.contracts(organization_id);
create index contracts_project_id_idx on public.contracts(project_id);

create table public.contract_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  contract_id uuid not null references public.contracts(id),
  name text not null,
  sequence integer not null check (sequence > 0),
  planned_amount_cents bigint not null check (planned_amount_cents >= 0),
  unique (contract_id, sequence)
);
create index contract_stages_organization_id_idx on public.contract_stages(organization_id);

create table public.work_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  worker_id uuid not null references public.workers(id),
  worked_on date not null,
  quantity numeric(8,2) not null check (quantity > 0),
  unit text not null check (unit in ('day', 'hour')),
  unit_rate_cents bigint not null check (unit_rate_cents > 0),
  created_at timestamptz not null default now()
);
create index work_entries_organization_id_idx on public.work_entries(organization_id);

create table public.financial_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  proposal_type text not null check (proposal_type in ('worker_advance')),
  status public.proposal_status not null default 'pending',
  payload jsonb not null,
  source_text text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  check (jsonb_typeof(payload) = 'object')
);
create index financial_proposals_organization_id_idx on public.financial_proposals(organization_id);
create index financial_proposals_created_by_idx on public.financial_proposals(created_by);

create table public.worker_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  worker_id uuid not null references public.workers(id),
  proposal_id uuid not null unique references public.financial_proposals(id),
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  note text,
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_by uuid references public.worker_advances(id),
  unique (organization_id, idempotency_key)
);
create index worker_advances_organization_id_idx on public.worker_advances(organization_id);
create index worker_advances_worker_id_idx on public.worker_advances(worker_id);
create index worker_advances_project_id_idx on public.worker_advances(project_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid references public.projects(id),
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  incurred_on date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index expenses_organization_id_idx on public.expenses(organization_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  contract_id uuid references public.contracts(id),
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  received_on date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index receipts_organization_id_idx on public.receipts(organization_id);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid references public.projects(id),
  direction public.ledger_direction not null,
  entry_type text not null check (entry_type in ('worker_advance', 'expense', 'receipt', 'reversal')),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  source_table text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);
create index ledger_entries_organization_id_idx on public.ledger_entries(organization_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);
create index audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);

create function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.active = true
  );
$$;

create function private.has_org_role(p_organization_id uuid, p_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role = any(p_roles)
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.organization_role[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.organization_role[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.workers enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_stages enable row level security;
alter table public.work_entries enable row level security;
alter table public.financial_proposals enable row level security;
alter table public.worker_advances enable row level security;
alter table public.expenses enable row level security;
alter table public.receipts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.organization_members, public.projects, public.workers,
  public.contracts, public.contract_stages, public.work_entries, public.financial_proposals,
  public.worker_advances, public.expenses, public.receipts, public.ledger_entries,
  public.audit_logs to authenticated;

create policy organizations_select on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));
create policy organization_members_select on public.organization_members for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy projects_select on public.projects for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy workers_select on public.workers for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy contracts_select on public.contracts for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy contract_stages_select on public.contract_stages for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy work_entries_select on public.work_entries for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy financial_proposals_select on public.financial_proposals for select to authenticated
  using (created_by = (select auth.uid()) and (select private.is_org_member(organization_id)));
create policy worker_advances_select on public.worker_advances for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy expenses_select on public.expenses for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy receipts_select on public.receipts for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[])));

create or replace function public.confirm_advance_proposal(
  p_proposal_id uuid,
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.financial_proposals%rowtype;
  v_existing public.worker_advances%rowtype;
  v_advance public.worker_advances%rowtype;
  v_worker_id uuid;
  v_project_id uuid;
  v_amount_cents bigint;
  v_paid_on date;
  v_note text;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active = true
      and m.role in ('owner', 'admin', 'finance')
  ) then
    raise exception 'insufficient_role';
  end if;

  select * into v_existing
  from public.worker_advances a
  where a.organization_id = p_organization_id
    and a.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.proposal_id <> p_proposal_id then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'advance_id', v_existing.id,
      'proposal_id', v_existing.proposal_id,
      'idempotency_key', v_existing.idempotency_key,
      'already_processed', true,
      'confirmed_at', v_existing.created_at
    );
  end if;

  select * into v_proposal
  from public.financial_proposals p
  where p.id = p_proposal_id
    and p.organization_id = p_organization_id
    and p.created_by = p_actor_user_id
  for update;

  if not found or v_proposal.proposal_type <> 'worker_advance' then
    raise exception 'proposal_unavailable';
  end if;

  select * into v_existing
  from public.worker_advances a
  where a.proposal_id = p_proposal_id;
  if found then
    return jsonb_build_object(
      'advance_id', v_existing.id,
      'proposal_id', v_existing.proposal_id,
      'idempotency_key', v_existing.idempotency_key,
      'already_processed', true,
      'confirmed_at', v_existing.created_at
    );
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'proposal_unavailable';
  end if;
  if v_proposal.expires_at <= now() then
    update public.financial_proposals set status = 'expired' where id = v_proposal.id;
    raise exception 'proposal_expired';
  end if;

  v_worker_id := (v_proposal.payload->>'workerId')::uuid;
  v_project_id := (v_proposal.payload->>'projectId')::uuid;
  v_amount_cents := (v_proposal.payload->>'amountCents')::bigint;
  v_paid_on := (v_proposal.payload->>'paidOn')::date;
  v_note := nullif(v_proposal.payload->>'note', '');

  if v_amount_cents <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from public.workers w
    where w.id = v_worker_id and w.organization_id = p_organization_id and w.active = true
  ) then raise exception 'invalid_worker'; end if;
  if not exists (
    select 1 from public.projects p
    where p.id = v_project_id and p.organization_id = p_organization_id and p.active = true
  ) then raise exception 'invalid_project'; end if;

  insert into public.worker_advances (
    organization_id, project_id, worker_id, proposal_id, amount_cents,
    paid_on, note, idempotency_key, created_by
  ) values (
    p_organization_id, v_project_id, v_worker_id, p_proposal_id, v_amount_cents,
    v_paid_on, v_note, p_idempotency_key, p_actor_user_id
  ) returning * into v_advance;

  insert into public.ledger_entries (
    organization_id, project_id, direction, entry_type, amount_cents,
    occurred_on, source_table, source_id
  ) values (
    p_organization_id, v_project_id, 'out', 'worker_advance', v_amount_cents,
    v_paid_on, 'worker_advances', v_advance.id
  );

  update public.financial_proposals
  set status = 'confirmed', confirmed_at = now()
  where id = p_proposal_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    'worker_advance.confirmed',
    'worker_advance',
    v_advance.id,
    jsonb_build_object(
      'proposal_id', p_proposal_id,
      'project_id', v_project_id,
      'worker_id', v_worker_id,
      'amount_cents', v_amount_cents,
      'idempotency_key', p_idempotency_key
    )
  );

  return jsonb_build_object(
    'advance_id', v_advance.id,
    'proposal_id', v_advance.proposal_id,
    'idempotency_key', v_advance.idempotency_key,
    'already_processed', false,
    'confirmed_at', v_advance.created_at
  );
end;
$$;

revoke all on function public.confirm_advance_proposal(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_advance_proposal(uuid, uuid, uuid, uuid) to service_role;

