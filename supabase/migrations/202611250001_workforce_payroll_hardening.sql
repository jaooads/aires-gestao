-- Incremental hardening for installations that already applied 202611240002.
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
    if tg_op <> 'UPDATE'
      or new.payroll_closure_id is not null
      or current_setting('aires.payroll_release_closure', true) is distinct from old.payroll_closure_id::text
    then raise exception 'closed_time_entry'; end if;
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
  elsif new.status = 'hourly' then raise exception 'time_required';
  elsif new.status = 'full_day' then new.worked_minutes := 480;
  elsif new.status = 'half_day' then new.worked_minutes := 240;
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

create or replace function aires.attach_payroll_time_entries(
  p_closure_id uuid, p_time_entry_ids uuid[], p_actor_user_id uuid, p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closure aires.payroll_closures%rowtype;
  v_expected integer;
  v_attached integer;
begin
  if not exists (
    select 1 from aires.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.active = true and m.role in ('owner', 'admin', 'finance')
  ) then raise exception 'insufficient_role'; end if;
  select * into v_closure from aires.payroll_closures c
  where c.id = p_closure_id and c.organization_id = p_organization_id
    and c.status in ('draft', 'review') for update;
  if not found then raise exception 'closure_unavailable'; end if;
  select count(distinct value) into v_expected from unnest(p_time_entry_ids) ids(value);
  if v_expected = 0 or v_expected <> coalesce(array_length(p_time_entry_ids, 1), 0) then
    raise exception 'invalid_time_entry_selection';
  end if;
  perform 1 from aires.time_entries e where e.id = any(p_time_entry_ids) order by e.id for update;
  select count(*) into v_attached from aires.time_entries e
  where e.id = any(p_time_entry_ids) and e.organization_id = p_organization_id
    and e.worker_id = v_closure.worker_id
    and e.work_date between v_closure.period_start and v_closure.period_end
    and e.payroll_closure_id is null;
  if v_attached <> v_expected then raise exception 'time_entry_unavailable'; end if;
  update aires.time_entries set payroll_closure_id = v_closure.id, updated_by = p_actor_user_id
  where id = any(p_time_entry_ids) and payroll_closure_id is null;
  return v_attached;
end;
$$;

create or replace function aires.cancel_payroll_closure(
  p_closure_id uuid, p_actor_user_id uuid, p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_closure aires.payroll_closures%rowtype;
begin
  if not exists (
    select 1 from aires.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_actor_user_id
      and m.active = true and m.role in ('owner', 'admin', 'finance')
  ) then raise exception 'insufficient_role'; end if;
  select * into v_closure from aires.payroll_closures c
  where c.id = p_closure_id and c.organization_id = p_organization_id for update;
  if not found then raise exception 'closure_not_found'; end if;
  if v_closure.status = 'paid' then raise exception 'paid_closure_cannot_be_cancelled'; end if;
  if v_closure.status = 'cancelled' then
    return jsonb_build_object('closure_id', v_closure.id, 'already_cancelled', true);
  end if;
  perform pg_catalog.set_config('aires.payroll_release_closure', v_closure.id::text, true);
  update aires.time_entries set payroll_closure_id = null, updated_by = p_actor_user_id
  where payroll_closure_id = v_closure.id and organization_id = p_organization_id;
  update aires.payroll_closure_advances set active = false
  where payroll_closure_id = v_closure.id and organization_id = p_organization_id;
  update aires.payroll_closures set status = 'cancelled', updated_at = now() where id = v_closure.id;
  insert into aires.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, p_actor_user_id, 'payroll.cancelled', 'payroll_closure', v_closure.id,
    jsonb_build_object('worker_id', v_closure.worker_id));
  return jsonb_build_object('closure_id', v_closure.id, 'already_cancelled', false);
end;
$$;

revoke all on function aires.attach_payroll_time_entries(uuid, uuid[], uuid, uuid) from public, anon, authenticated;
revoke all on function aires.cancel_payroll_closure(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function aires.attach_payroll_time_entries(uuid, uuid[], uuid, uuid) to service_role;
grant execute on function aires.cancel_payroll_closure(uuid, uuid, uuid) to service_role;
