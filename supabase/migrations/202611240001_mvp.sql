create type aires.project_status as enum ('planning', 'active', 'paused', 'completed');
create type aires.worker_payment_model as enum ('daily', 'hourly');

alter table aires.projects
  add column client_name text not null default 'Cliente não informado',
  add column description text,
  add column status aires.project_status not null default 'planning',
  add column expected_cost_cents bigint not null default 0 check (expected_cost_cents >= 0),
  add column starts_on date,
  add column ends_on date,
  add column updated_at timestamptz not null default now();

update aires.projects set status = case when active then 'active'::aires.project_status else 'completed'::aires.project_status end;

alter table aires.workers
  add column role_title text not null default 'Profissional da construção',
  add column payment_model aires.worker_payment_model not null default 'daily',
  add column hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents > 0),
  add column phone text,
  add column updated_at timestamptz not null default now();

alter table aires.workers add constraint workers_payment_rate_check check (
  (daily_rate_cents is null and hourly_rate_cents is null)
  or (payment_model = 'daily' and daily_rate_cents is not null)
  or (payment_model = 'hourly' and hourly_rate_cents is not null)
);

alter table aires.contracts
  add column expected_cost_cents bigint not null default 0 check (expected_cost_cents >= 0),
  add column updated_at timestamptz not null default now();

alter table aires.contract_stages
  add column expected_cost_cents bigint not null default 0 check (expected_cost_cents >= 0),
  add column completed_on date,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create table aires.project_workers (
  organization_id uuid not null references aires.organizations(id),
  project_id uuid not null references aires.projects(id),
  worker_id uuid not null references aires.workers(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, worker_id)
);
create index project_workers_organization_id_idx on aires.project_workers(organization_id);
create index project_workers_worker_id_idx on aires.project_workers(worker_id);

alter table aires.expenses
  add column category text not null default 'Geral',
  add column idempotency_key uuid,
  add column updated_at timestamptz not null default now(),
  add constraint expenses_org_idempotency_unique unique (organization_id, idempotency_key);

alter table aires.receipts
  add column idempotency_key uuid,
  add column updated_at timestamptz not null default now(),
  add constraint receipts_org_idempotency_unique unique (organization_id, idempotency_key);

alter table aires.project_workers enable row level security;
grant all privileges on aires.project_workers to service_role;
grant select on aires.project_workers to authenticated;
create policy project_workers_select on aires.project_workers for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));

create or replace function aires.record_expense(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_idempotency_key uuid,
  p_project_id uuid,
  p_description text,
  p_category text,
  p_amount_cents bigint,
  p_incurred_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense aires.expenses%rowtype;
  v_ledger aires.ledger_entries%rowtype;
begin
  if not exists (
    select 1 from aires.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active = true
      and m.role in ('owner', 'admin', 'finance')
  ) then raise exception 'insufficient_role'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || p_idempotency_key::text, 0)
  );

  select * into v_expense from aires.expenses e
  where e.organization_id = p_organization_id and e.idempotency_key = p_idempotency_key;
  if found then
    select * into v_ledger from aires.ledger_entries l
    where l.source_table = 'expenses' and l.source_id = v_expense.id;
    return jsonb_build_object('id', v_expense.id, 'ledger_entry_id', v_ledger.id, 'already_processed', true);
  end if;

  if p_amount_cents <= 0 then raise exception 'invalid_amount'; end if;
  if p_project_id is not null and not exists (
    select 1 from aires.projects p
    where p.id = p_project_id and p.organization_id = p_organization_id
  ) then raise exception 'invalid_project'; end if;

  insert into aires.expenses (
    organization_id, project_id, description, category, amount_cents, incurred_on,
    idempotency_key, created_by
  ) values (
    p_organization_id, p_project_id, trim(p_description), trim(p_category), p_amount_cents,
    p_incurred_on, p_idempotency_key, p_actor_user_id
  ) returning * into v_expense;

  insert into aires.ledger_entries (
    organization_id, project_id, direction, entry_type, amount_cents, occurred_on,
    source_table, source_id
  ) values (
    p_organization_id, p_project_id, 'out', 'expense', p_amount_cents, p_incurred_on,
    'expenses', v_expense.id
  ) returning * into v_ledger;

  insert into aires.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organization_id, p_actor_user_id, 'expense.created', 'expense', v_expense.id,
    jsonb_build_object('project_id', p_project_id, 'amount_cents', p_amount_cents, 'category', p_category)
  );

  return jsonb_build_object('id', v_expense.id, 'ledger_entry_id', v_ledger.id, 'already_processed', false);
end;
$$;

create or replace function aires.record_receipt(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_idempotency_key uuid,
  p_project_id uuid,
  p_contract_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_received_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt aires.receipts%rowtype;
  v_ledger aires.ledger_entries%rowtype;
begin
  if not exists (
    select 1 from aires.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.active = true
      and m.role in ('owner', 'admin', 'finance')
  ) then raise exception 'insufficient_role'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || p_idempotency_key::text, 0)
  );

  select * into v_receipt from aires.receipts r
  where r.organization_id = p_organization_id and r.idempotency_key = p_idempotency_key;
  if found then
    select * into v_ledger from aires.ledger_entries l
    where l.source_table = 'receipts' and l.source_id = v_receipt.id;
    return jsonb_build_object('id', v_receipt.id, 'ledger_entry_id', v_ledger.id, 'already_processed', true);
  end if;

  if p_amount_cents <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from aires.projects p
    where p.id = p_project_id and p.organization_id = p_organization_id
  ) then raise exception 'invalid_project'; end if;
  if p_contract_id is not null and not exists (
    select 1 from aires.contracts c
    where c.id = p_contract_id and c.project_id = p_project_id and c.organization_id = p_organization_id
  ) then raise exception 'invalid_contract'; end if;

  insert into aires.receipts (
    organization_id, project_id, contract_id, description, amount_cents, received_on,
    idempotency_key, created_by
  ) values (
    p_organization_id, p_project_id, p_contract_id, trim(p_description), p_amount_cents,
    p_received_on, p_idempotency_key, p_actor_user_id
  ) returning * into v_receipt;

  insert into aires.ledger_entries (
    organization_id, project_id, direction, entry_type, amount_cents, occurred_on,
    source_table, source_id
  ) values (
    p_organization_id, p_project_id, 'in', 'receipt', p_amount_cents, p_received_on,
    'receipts', v_receipt.id
  ) returning * into v_ledger;

  insert into aires.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_organization_id, p_actor_user_id, 'receipt.created', 'receipt', v_receipt.id,
    jsonb_build_object('project_id', p_project_id, 'contract_id', p_contract_id, 'amount_cents', p_amount_cents)
  );

  return jsonb_build_object('id', v_receipt.id, 'ledger_entry_id', v_ledger.id, 'already_processed', false);
end;
$$;

revoke all on function aires.record_expense(uuid, uuid, uuid, uuid, text, text, bigint, date) from public, anon, authenticated;
revoke all on function aires.record_receipt(uuid, uuid, uuid, uuid, uuid, text, bigint, date) from public, anon, authenticated;
grant execute on function aires.record_expense(uuid, uuid, uuid, uuid, text, text, bigint, date) to service_role;
grant execute on function aires.record_receipt(uuid, uuid, uuid, uuid, uuid, text, bigint, date) to service_role;
