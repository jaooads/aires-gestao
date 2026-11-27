create type aires.worker_compensation_model as enum ('hourly', 'daily', 'weekly');
create type aires.payment_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');
create type aires.time_entry_status as enum ('full_day', 'half_day', 'hourly', 'absence', 'day_off');
create type aires.payroll_closure_status as enum ('draft', 'review', 'paid', 'cancelled');
create type aires.payroll_adjustment_kind as enum ('addition', 'deduction');

alter table aires.workers
  add column compensation_model aires.worker_compensation_model not null default 'daily',
  add column payment_frequency aires.payment_frequency not null default 'weekly',
  add column weekly_rate_cents bigint check (weekly_rate_cents is null or weekly_rate_cents > 0),
  add column normal_week_days integer not null default 6 check (normal_week_days between 1 and 7);

update aires.workers
set compensation_model = case payment_model::text
  when 'hourly' then 'hourly'::aires.worker_compensation_model
  else 'daily'::aires.worker_compensation_model
end;

alter table aires.workers add constraint workers_compensation_rate_check check (
  (daily_rate_cents is null and hourly_rate_cents is null and weekly_rate_cents is null)
  or (compensation_model = 'daily' and daily_rate_cents is not null)
  or (compensation_model = 'hourly' and hourly_rate_cents is not null)
  or (compensation_model = 'weekly' and weekly_rate_cents is not null)
);

create table aires.payroll_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references aires.organizations(id),
  worker_id uuid not null references aires.workers(id),
  period_start date not null,
  period_end date not null,
  status aires.payroll_closure_status not null default 'draft',
  compensation_model aires.worker_compensation_model not null,
  payment_frequency aires.payment_frequency not null,
  rate_cents bigint not null check (rate_cents > 0),
  normal_week_days integer not null check (normal_week_days between 1 and 7),
  full_days integer not null default 0 check (full_days >= 0),
  half_days integer not null default 0 check (half_days >= 0),
  absences integer not null default 0 check (absences >= 0),
  days_off integer not null default 0 check (days_off >= 0),
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  gross_cents bigint not null check (gross_cents >= 0),
  advances_cents bigint not null default 0 check (advances_cents >= 0),
  additions_cents bigint not null default 0 check (additions_cents >= 0),
  deductions_cents bigint not null default 0 check (deductions_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),
  note text,
  paid_on date not null,
  idempotency_key uuid,
  created_by uuid not null references auth.users(id),
  paid_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  check (period_end >= period_start),
  unique (organization_id, idempotency_key)
);
create index payroll_closures_org_period_idx on aires.payroll_closures(organization_id, period_start, period_end);
create index payroll_closures_worker_status_idx on aires.payroll_closures(worker_id, status);

create table aires.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references aires.organizations(id),
  worker_id uuid not null references aires.workers(id),
  project_id uuid not null references aires.projects(id),
  work_date date not null,
  status aires.time_entry_status not null,
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes between 0 and 1440),
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  note text,
  payroll_closure_id uuid references aires.payroll_closures(id),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index time_entries_org_date_idx on aires.time_entries(organization_id, work_date);
create index time_entries_worker_date_idx on aires.time_entries(worker_id, work_date);
create index time_entries_project_date_idx on aires.time_entries(project_id, work_date);
create index time_entries_open_idx on aires.time_entries(organization_id, worker_id, work_date) where payroll_closure_id is null;
create unique index time_entries_non_hourly_day_uidx
  on aires.time_entries(organization_id, worker_id, work_date)
  where status <> 'hourly';

create table aires.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references aires.organizations(id),
  payroll_closure_id uuid not null references aires.payroll_closures(id) on delete cascade,
  kind aires.payroll_adjustment_kind not null,
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index payroll_adjustments_closure_idx on aires.payroll_adjustments(payroll_closure_id);

create table aires.payroll_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references aires.organizations(id),
  payroll_closure_id uuid not null references aires.payroll_closures(id) on delete cascade,
  project_id uuid not null references aires.projects(id),
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (payroll_closure_id, project_id)
);
create index payroll_allocations_project_idx on aires.payroll_allocations(project_id);

create table aires.payroll_closure_advances (
  organization_id uuid not null references aires.organizations(id),
  payroll_closure_id uuid not null references aires.payroll_closures(id) on delete cascade,
  worker_advance_id uuid not null references aires.worker_advances(id),
  amount_cents bigint not null check (amount_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (payroll_closure_id, worker_advance_id)
);
create unique index payroll_closure_advances_active_uidx
  on aires.payroll_closure_advances(worker_advance_id) where active;

alter table aires.worker_advances
  add column compensated_by_closure_id uuid references aires.payroll_closures(id),
  add column compensated_at timestamptz;
create index worker_advances_uncompensated_idx
  on aires.worker_advances(organization_id, worker_id, paid_on)
  where compensated_by_closure_id is null and reversed_by is null;

alter table aires.ledger_entries drop constraint if exists ledger_entries_entry_type_check;
alter table aires.ledger_entries add constraint ledger_entries_entry_type_check
  check (entry_type in ('worker_advance', 'worker_payment', 'expense', 'receipt', 'reversal'));

create or replace function aires_private.validate_time_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration integer;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.payroll_closure_id is not null then
    raise exception 'closed_time_entry';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.organization_id::text || new.worker_id::text || new.work_date::text, 0
  ));

  if not exists (select 1 from aires.workers w where w.id = new.worker_id and w.organization_id = new.organization_id)
    or not exists (select 1 from aires.projects p where p.id = new.project_id and p.organization_id = new.organization_id)
  then raise exception 'invalid_tenant_reference'; end if;

  if new.status in ('absence', 'day_off') then
    new.start_time := null; new.end_time := null; new.break_minutes := 0; new.worked_minutes := 0;
  elsif new.start_time is not null or new.end_time is not null then
    if new.start_time is null or new.end_time is null or new.end_time <= new.start_time then
      raise exception 'invalid_time_range';
    end if;
    v_duration := floor(extract(epoch from (new.end_time - new.start_time)) / 60)::integer;
    if new.break_minutes >= v_duration then raise exception 'invalid_break'; end if;
    new.worked_minutes := v_duration - new.break_minutes;
  elsif new.status = 'hourly' then
    raise exception 'time_required';
  elsif new.status = 'full_day' then
    new.worked_minutes := 480;
  elsif new.status = 'half_day' then
    new.worked_minutes := 240;
  end if;

  if new.status = 'hourly' then
    if exists (
      select 1 from aires.time_entries e
      where e.organization_id = new.organization_id and e.worker_id = new.worker_id
        and e.work_date = new.work_date and e.id <> new.id
        and (e.status <> 'hourly' or (e.start_time < new.end_time and e.end_time > new.start_time))
    ) then raise exception 'duplicate_time_entry'; end if;
  elsif exists (
    select 1 from aires.time_entries e
    where e.organization_id = new.organization_id and e.worker_id = new.worker_id
      and e.work_date = new.work_date and e.id <> new.id
  ) then raise exception 'duplicate_time_entry'; end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger time_entries_validate_before_write
before insert or update or delete on aires.time_entries
for each row execute function aires_private.validate_time_entry();

alter table aires.payroll_closures enable row level security;
alter table aires.time_entries enable row level security;
alter table aires.payroll_adjustments enable row level security;
alter table aires.payroll_allocations enable row level security;
alter table aires.payroll_closure_advances enable row level security;

grant all privileges on aires.payroll_closures, aires.time_entries, aires.payroll_adjustments,
  aires.payroll_allocations, aires.payroll_closure_advances to service_role;
grant select on aires.payroll_closures, aires.time_entries, aires.payroll_adjustments,
  aires.payroll_allocations, aires.payroll_closure_advances to authenticated;

create policy payroll_closures_select on aires.payroll_closures for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));
create policy time_entries_select on aires.time_entries for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));
create policy payroll_adjustments_select on aires.payroll_adjustments for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));
create policy payroll_allocations_select on aires.payroll_allocations for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));
create policy payroll_closure_advances_select on aires.payroll_closure_advances for select to authenticated
  using ((select aires_private.is_org_member(organization_id)));

create or replace function aires.confirm_payroll_closure(
  p_closure_id uuid,
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
  v_closure aires.payroll_closures%rowtype;
  v_gross bigint;
  v_advances bigint;
  v_additions bigint;
  v_deductions bigint;
  v_labor_cost bigint;
  v_net bigint;
  v_allocation bigint;
  v_ledger_id uuid;
begin
  if not exists (
    select 1 from aires.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.active = true and m.role in ('owner', 'admin', 'finance')
  ) then raise exception 'insufficient_role'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || p_closure_id::text, 0));
  select * into v_closure from aires.payroll_closures c
  where c.id = p_closure_id and c.organization_id = p_organization_id for update;
  if not found then raise exception 'closure_not_found'; end if;

  if v_closure.status = 'paid' then
    if v_closure.idempotency_key = p_idempotency_key then
      select id into v_ledger_id from aires.ledger_entries
      where source_table = 'payroll_closures' and source_id = v_closure.id;
      return jsonb_build_object('closure_id', v_closure.id, 'ledger_entry_id', v_ledger_id,
        'already_processed', true, 'paid_at', v_closure.paid_at);
    end if;
    raise exception 'payment_already_confirmed';
  end if;
  if v_closure.status <> 'review' then raise exception 'closure_not_in_review'; end if;

  if exists (
    select 1 from aires.payroll_allocations pa
    left join aires.projects p on p.id = pa.project_id and p.organization_id = p_organization_id
    where pa.payroll_closure_id = v_closure.id
      and (pa.organization_id <> p_organization_id or p.id is null)
  ) then raise exception 'invalid_allocation_tenant'; end if;
  if exists (
    select 1 from aires.payroll_closure_advances ca
    left join aires.worker_advances wa on wa.id = ca.worker_advance_id
    where ca.payroll_closure_id = v_closure.id and ca.active
      and (ca.organization_id <> p_organization_id or wa.id is null
        or wa.organization_id <> p_organization_id or wa.worker_id <> v_closure.worker_id
        or wa.reversed_by is not null or wa.compensated_by_closure_id is not null
        or wa.amount_cents <> ca.amount_cents)
  ) then raise exception 'advance_unavailable'; end if;

  if v_closure.compensation_model = 'hourly' then
    select round(coalesce(sum(e.worked_minutes), 0)::numeric * v_closure.rate_cents / 60)::bigint
      into v_gross from aires.time_entries e
      where e.organization_id = p_organization_id and e.worker_id = v_closure.worker_id
        and e.work_date between v_closure.period_start and v_closure.period_end
        and e.payroll_closure_id = v_closure.id;
  elsif v_closure.compensation_model = 'daily' then
    select coalesce(sum(case e.status when 'full_day' then v_closure.rate_cents
      when 'half_day' then round(v_closure.rate_cents::numeric / 2)::bigint else 0 end), 0)::bigint
      into v_gross from aires.time_entries e
      where e.organization_id = p_organization_id and e.worker_id = v_closure.worker_id
        and e.work_date between v_closure.period_start and v_closure.period_end
        and e.payroll_closure_id = v_closure.id;
  else
    v_gross := round(v_closure.rate_cents::numeric * (v_closure.period_end - v_closure.period_start + 1) / 7)::bigint;
  end if;

  select coalesce(sum(a.amount_cents) filter (where a.kind = 'addition'), 0),
         coalesce(sum(a.amount_cents) filter (where a.kind = 'deduction'), 0)
    into v_additions, v_deductions from aires.payroll_adjustments a
    where a.payroll_closure_id = v_closure.id;
  select coalesce(sum(ca.amount_cents), 0) into v_advances
    from aires.payroll_closure_advances ca
    join aires.worker_advances wa on wa.id = ca.worker_advance_id
    where ca.payroll_closure_id = v_closure.id and ca.active and wa.worker_id = v_closure.worker_id
      and wa.organization_id = p_organization_id and wa.compensated_by_closure_id is null;

  v_labor_cost := v_gross + v_additions - v_deductions;
  v_net := v_labor_cost - v_advances;
  if v_labor_cost < 0 or v_net < 0 then raise exception 'negative_payroll_total'; end if;
  if (v_gross, v_advances, v_additions, v_deductions, v_net) is distinct from
     (v_closure.gross_cents, v_closure.advances_cents, v_closure.additions_cents, v_closure.deductions_cents, v_closure.net_cents)
  then raise exception 'closure_values_changed'; end if;

  select coalesce(sum(pa.amount_cents), 0) into v_allocation
    from aires.payroll_allocations pa where pa.payroll_closure_id = v_closure.id;
  if v_allocation <> v_labor_cost then raise exception 'invalid_allocation_total'; end if;

  update aires.worker_advances wa set compensated_by_closure_id = v_closure.id, compensated_at = now()
    where wa.id in (select ca.worker_advance_id from aires.payroll_closure_advances ca where ca.payroll_closure_id = v_closure.id and ca.active)
      and wa.organization_id = p_organization_id and wa.worker_id = v_closure.worker_id
      and wa.compensated_by_closure_id is null;

  if v_net > 0 then
    insert into aires.ledger_entries (
      organization_id, project_id, direction, entry_type, amount_cents, occurred_on, source_table, source_id
    ) values (
      p_organization_id, null, 'out', 'worker_payment', v_net, v_closure.paid_on, 'payroll_closures', v_closure.id
    ) returning id into v_ledger_id;
  end if;

  update aires.payroll_closures set status = 'paid', idempotency_key = p_idempotency_key,
    gross_cents = v_gross, advances_cents = v_advances, additions_cents = v_additions,
    deductions_cents = v_deductions, net_cents = v_net, paid_by = p_actor_user_id,
    paid_at = now(), updated_at = now()
  where id = v_closure.id;

  insert into aires.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, p_actor_user_id, 'payroll.paid', 'payroll_closure', v_closure.id,
    jsonb_build_object('worker_id', v_closure.worker_id, 'gross_cents', v_gross,
      'advances_cents', v_advances, 'net_cents', v_net, 'labor_cost_cents', v_labor_cost));

  return jsonb_build_object('closure_id', v_closure.id, 'ledger_entry_id', v_ledger_id,
    'already_processed', false, 'paid_at', now());
end;
$$;

revoke all on function aires.confirm_payroll_closure(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function aires.confirm_payroll_closure(uuid, uuid, uuid, uuid) to service_role;
