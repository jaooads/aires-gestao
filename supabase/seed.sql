insert into aires.organizations (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Aires Construções')
on conflict (id) do nothing;

insert into aires.projects (id, organization_id, name, address)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Obra do Centro',
  'Centro'
)
on conflict (id) do nothing;

insert into aires.workers (id, organization_id, name, daily_rate_cents)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Marcelo',
  25000
)
on conflict (id) do nothing;

-- Depois de criar o primeiro usuário no Supabase Auth, associe-o como dono:
-- insert into aires.organization_members (organization_id, user_id, role)
-- values ('10000000-0000-4000-8000-000000000001', 'UUID-DO-USUARIO', 'owner');
